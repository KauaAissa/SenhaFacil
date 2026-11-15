import { useAccessibilityStore } from '../stores/accessibility.store';
import { colors, contrastColors, type ThemeColors } from '../theme/theme';

export function useThemeColors(): ThemeColors {
  return useAccessibilityStore((state) => state.highContrast) ? contrastColors : colors;
}
