import type { AccessRequestLocation } from './access-api.service';

export const MAP_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

export function isMapCopyrightUrl(url: string): boolean {
  return url === MAP_COPYRIGHT_URL;
}

export const mapPresentationScript = `(function(){
  var viewport=document.querySelector('meta[name="viewport"]')||document.createElement('meta');
  viewport.name='viewport';viewport.content='width=device-width, initial-scale=1.0';
  document.head.appendChild(viewport);
  var style=document.createElement('style');
  style.textContent='.leaflet-control-zoom a,.leaflet-control-zoom button,.leaflet-control-zoom-in,.leaflet-control-zoom-out,.maplibregl-ctrl-group button{width:56px!important;height:56px!important;line-height:56px!important;font-size:32px!important}.leaflet-control-attribution,.maplibregl-ctrl-attrib{font-size:14px!important;line-height:1.4!important;max-width:85vw}.leaflet-marker-icon,.maplibregl-marker{pointer-events:none}.maplibregl-ctrl-attrib-report-link{display:none!important}';
  document.head.appendChild(style);
  document.querySelectorAll('.leaflet-marker-icon,.maplibregl-marker').forEach(function(marker){marker.setAttribute('role','img');marker.setAttribute('aria-label','Posição aproximada no envio');marker.setAttribute('tabindex','-1');});
  function simplifyAttribution(){
    document.querySelectorAll('.maplibregl-ctrl-attrib-report-link').forEach(function(link){
      var separator=link.nextSibling;
      if(separator&&separator.nodeType===3)separator.textContent=separator.textContent.replace(/^\\s*\\|\\s*/, '');
      link.remove();
    });
    document.querySelectorAll('.maplibregl-ctrl-attrib-inner a,.leaflet-control-attribution a').forEach(function(link){
      var href=link.getAttribute('href')||'';
      if(href==='https://supporting.openstreetmap.org'||href==='https://supporting.openstreetmap.org/'||href==='https://wiki.osmfoundation.org/wiki/Terms_of_Use'){
        [link.previousSibling,link.nextSibling].forEach(function(separator){
          if(separator&&separator.nodeType===3&&/^[\\s.|\\u2665\\u2764\\uFE0F]*$/.test(separator.textContent))separator.remove();
        });
        link.remove();
      }else if(href==='/copyright'||href===${JSON.stringify(MAP_COPYRIGHT_URL)}){
        if(link.textContent!=='OpenStreetMap')link.textContent='OpenStreetMap';
      }
    });
  }
  simplifyAttribution();
  if(document.body&&typeof MutationObserver==='function')new MutationObserver(simplifyAttribution).observe(document.body,{childList:true,subtree:true});
  if(window.dispatchEvent)window.dispatchEvent(new Event('resize'));
})();true;`;

export function requestMapUrl(location: AccessRequestLocation): string {
  const { latitude, longitude, accuracy } = location;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(accuracy) || accuracy < 0 || !Number.isFinite(Date.parse(location.capturedAt))) {
    throw new Error('REQUEST_MAP_INVALID_LOCATION');
  }
  const latitudeRadius = Math.min(1, Math.max(0.005, accuracy / 111_320));
  const longitudeRadius = Math.min(180, latitudeRadius / Math.max(0.01, Math.cos(latitude * Math.PI / 180)));
  const bounds = [Math.max(-180, longitude - longitudeRadius), Math.max(-90, latitude - latitudeRadius),
    Math.min(180, longitude + longitudeRadius), Math.min(90, latitude + latitudeRadius)];
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bounds.join(','))}&layer=mapnik&marker=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export function canNavigateRequestMap(url: string, initialUrl: string): boolean {
  return url === initialUrl || url === 'about:blank';
}
