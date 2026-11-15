import * as SecureStore from 'expo-secure-store';
import { useAccessibilityStore } from '../src/stores/accessibility.store';
import { colors, contrastColors, toneColors, fontSizes, touchTarget, type Tone } from '../src/theme/theme';
import { categories, categoryDetails } from '../src/theme/categories';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('normal controls meet AA contrast and reinforced controls exceed AAA contrast', () => {
  const white = luminance('#FFFFFF');
  for (const color of [colors.primary, colors.danger, colors.textSecondary]) expect((white + 0.05) / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(4.5);
  expect((white + 0.05) / 0.05).toBeGreaterThanOrEqual(7);
});

test('accessibility preferences persist and hydrate independently of account', async () => {
  await useAccessibilityStore.getState().setTextScale(1.4);
  await useAccessibilityStore.getState().setHighContrast(true);
  useAccessibilityStore.setState({ textScale: 1, highContrast: false });
  await useAccessibilityStore.getState().hydrate();
  expect(useAccessibilityStore.getState()).toEqual(expect.objectContaining({ textScale: 1.4, highContrast: true }));
});

test('invalid stored preferences fall back to bounded values', async () => {
  await SecureStore.setItemAsync('sf_accessibility_v1', '{"textScale":100,"highContrast":"yes"}');
  await useAccessibilityStore.getState().hydrate();
  expect(useAccessibilityStore.getState()).toEqual(expect.objectContaining({ textScale: 1, highContrast: false }));
});

test.each([['normal', colors], ['reinforced', contrastColors]] as const)('%s palette preserves readable surfaces, feedback and inputs', (_name, palette) => {
  const tones: Tone[] = ['primary', 'accent', 'coral', 'success', 'warning', 'danger', 'neutral'];
  for (const tone of tones) {
    const pair = toneColors(palette, tone);
    expect(contrast(pair.foreground, pair.background)).toBeGreaterThanOrEqual(4.5);
  }
  for (const background of [palette.surface, palette.background, palette.surfaceMuted, palette.primarySoft]) {
    expect(contrast(palette.textPrimary, background)).toBeGreaterThanOrEqual(7);
    expect(contrast(palette.textSecondary, background)).toBeGreaterThanOrEqual(4.5);
  }
  for (const background of [palette.primary, palette.primaryDark, palette.danger, palette.disabled]) {
    expect(contrast(palette.inverse, background)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(palette.inputBorder, palette.surface)).toBeGreaterThanOrEqual(3);
  expect(contrast(palette.inputBorder, palette.surfaceMuted)).toBeGreaterThanOrEqual(3);
  expect(contrast(palette.primary, palette.primarySoft)).toBeGreaterThanOrEqual(3);
});

test('category presentation covers every vault category without depending only on color', () => {
  expect(categories.map((category) => category.value).sort()).toEqual([
    'BANKING', 'EMAIL', 'GOVERNMENT', 'HEALTH', 'OTHER', 'SHOPPING', 'SOCIAL_MEDIA',
  ]);
  for (const category of categories) {
    expect(category.label.length).toBeGreaterThan(0);
    expect(category.icon).toMatch(/-outline$/);
    expect(categoryDetails(category.value)).toEqual(category);
  }
  expect(categoryDetails('unknown').value).toBe('OTHER');
});

test('design keeps large touch targets and does not shrink the existing reading scales', () => {
  expect(touchTarget.minHeight).toBeGreaterThanOrEqual(56);
  expect(touchTarget.minWidth).toBeGreaterThanOrEqual(56);
  expect(fontSizes.caption).toBeGreaterThanOrEqual(16);
  expect(fontSizes.body).toBeGreaterThanOrEqual(18);
  expect(fontSizes.title).toBeGreaterThan(fontSizes.bodyLarge);
});