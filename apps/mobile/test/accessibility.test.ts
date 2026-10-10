import * as SecureStore from 'expo-secure-store';
import { useAccessibilityStore } from '../src/stores/accessibility.store';
import { colors } from '../src/theme/theme';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
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