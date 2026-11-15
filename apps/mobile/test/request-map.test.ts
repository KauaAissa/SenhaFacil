import { runInNewContext } from 'node:vm';
import { canNavigateRequestMap, isMapCopyrightUrl, MAP_COPYRIGHT_URL, mapPresentationScript, requestMapUrl } from '../src/services/request-map';

const point = { latitude: 0, longitude: 0, accuracy: 80, capturedAt: '2026-11-11T22:00:00Z' };

test('embedded map contains only the requested snapshot and a bounded viewport', () => {
  const url = new URL(requestMapUrl(point));
  expect(url.origin).toBe('https://www.openstreetmap.org');
  expect(url.pathname).toBe('/export/embed.html');
  expect([...url.searchParams.keys()].sort()).toEqual(['bbox', 'layer', 'marker']);
  expect(url.searchParams.get('marker')).toBe('0,0');
  expect(url.searchParams.get('layer')).toBe('mapnik');
  expect(url.searchParams.get('bbox')?.split(',').map(Number)).toEqual([-0.005, -0.005, 0.005, 0.005]);
});

test.each([
  { latitude: 90, longitude: 180, accuracy: 100_000 },
  { latitude: -90, longitude: -180, accuracy: 100_000 },
  { latitude: 89.99, longitude: 179.99, accuracy: 0 },
])('map bounds remain valid near poles and the date line (%j)', (coordinates) => {
  const url = new URL(requestMapUrl({ ...point, ...coordinates }));
  const [west, south, east, north] = url.searchParams.get('bbox')!.split(',').map(Number);
  expect(west).toBeGreaterThanOrEqual(-180); expect(east).toBeLessThanOrEqual(180);
  expect(south).toBeGreaterThanOrEqual(-90); expect(north).toBeLessThanOrEqual(90);
  expect(west).toBeLessThan(east); expect(south).toBeLessThan(north);
});

test.each([
  { latitude: 91 }, { latitude: NaN }, { longitude: 181 }, { longitude: Infinity },
  { accuracy: -1 }, { accuracy: NaN }, { capturedAt: 'invalid' },
])('malformed location cannot initiate a map request (%j)', (coordinates) => {
  expect(() => requestMapUrl({ ...point, ...coordinates })).toThrow('REQUEST_MAP_INVALID_LOCATION');
});

test('map blocks new navigation, file access and arbitrary external destinations', () => {
  const initial = requestMapUrl(point);
  expect(canNavigateRequestMap(initial, initial)).toBe(true);
  expect(canNavigateRequestMap('about:blank', initial)).toBe(true);
  for (const url of ['file:///private', 'javascript:alert(1)', 'https://example.com', initial + '&extra=value']) {
    expect(canNavigateRequestMap(url, initial)).toBe(false);
  }
});

test('map removes only the report invitation, preserves copyright and removes the invitation again after a provider update', () => {
  let reportVisible = true;
  let update: (() => void) | undefined;
  const separator = { nodeType: 3, textContent: ' | © colaboradores do OpenStreetMap' };
  const report = { nextSibling: separator, remove: () => { reportVisible = false; } };
  const styles: { textContent?: string }[] = [];
  const document = {
    querySelector: () => null,
    createElement: () => ({}),
    head: { appendChild: (element: { textContent?: string }) => { styles.push(element); } },
    body: {},
    querySelectorAll: (selector: string) => selector === '.maplibregl-ctrl-attrib-report-link' && reportVisible ? [report] : [],
  };
  runInNewContext(mapPresentationScript, { document, window: {}, MutationObserver: class {
    constructor(callback: () => void) { update = callback; }
    observe = jest.fn();
  } });
  expect(reportVisible).toBe(false);
  expect(separator.textContent).toBe('© colaboradores do OpenStreetMap');
  expect(styles.some((style) => style.textContent?.includes('.maplibregl-ctrl-attrib-report-link{display:none!important}'))).toBe(true);
  reportVisible = true; separator.textContent = ' | © colaboradores do OpenStreetMap';
  update?.();
  expect(reportVisible).toBe(false);
  expect(separator.textContent).toBe('© colaboradores do OpenStreetMap');
});

test('only the public copyright page can open externally, never a URL with coordinates or another origin', () => {
  expect(isMapCopyrightUrl(MAP_COPYRIGHT_URL)).toBe(true);
  for (const url of [MAP_COPYRIGHT_URL + '?lat=0&lon=0', 'https://example.com/copyright', 'http://www.openstreetmap.org/copyright', 'file:///private']) {
    expect(isMapCopyrightUrl(url)).toBe(false);
  }
});

test('donation and optional terms are removed while minimal copyright and its license link remain', () => {
  function separator(textContent: string) {
    return { nodeType: 3, textContent, removed: false, remove() { this.removed = true; } };
  }
  const copyrightText = separator('© ');
  const heart = separator(' ♥️ ');
  const dot = separator('. ');
  const copyright = { textContent: 'Contribuidores do OpenStreetMap', removed: false,
    getAttribute: () => '/copyright', previousSibling: copyrightText, nextSibling: heart, remove() { this.removed = true; } };
  const donation = { textContent: 'Faça uma doação', removed: false,
    getAttribute: () => 'https://supporting.openstreetmap.org', previousSibling: heart, nextSibling: dot, remove() { this.removed = true; } };
  const terms = { textContent: 'Termos do site e API', removed: false,
    getAttribute: () => 'https://wiki.osmfoundation.org/wiki/Terms_of_Use', previousSibling: dot, nextSibling: null, remove() { this.removed = true; } };
  const document = {
    querySelector: () => null, createElement: () => ({}), head: { appendChild: jest.fn() },
    querySelectorAll: (selector: string) => selector.includes('ctrl-attrib-inner a') ? [copyright, donation, terms].filter((link) => !link.removed) : [],
  };
  runInNewContext(mapPresentationScript, { document, window: {} });
  expect(donation.removed).toBe(true); expect(terms.removed).toBe(true);
  expect(heart.removed).toBe(true); expect(dot.removed).toBe(true);
  expect(copyright.removed).toBe(false); expect(copyrightText.removed).toBe(false);
  expect(copyright.textContent).toBe('OpenStreetMap');
  expect(copyright.getAttribute()).toBe('/copyright');
});
