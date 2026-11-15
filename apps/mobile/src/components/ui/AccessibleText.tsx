import { Text, type TextProps, StyleSheet } from 'react-native';
import { fonts, fontSizes } from '../../theme/theme';
import { useAccessibilityStore } from '../../stores/accessibility.store';
import { useThemeColors } from '../../hooks/useThemeColors';

type Variant = 'title' | 'titleLarge' | 'body' | 'bodyLarge' | 'caption';

interface AccessibleTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  bold?: boolean;
}

/**
 * Base text component enforcing minimum accessible font sizes across the app.
 * Always prefer this over the raw <Text> so font scale stays consistent.
 *
 * `allowFontScaling` stays enabled (default) so the component also respects
 * the OS-level accessibility font size set by the user.
 */
export function AccessibleText({
  variant = 'body',
  color,
  bold,
  style,
  ...rest
}: AccessibleTextProps) {
  const textScale = useAccessibilityStore((state) => state.textScale);
  const colors = useThemeColors();
  const textColor = color ?? (variant === 'caption' ? colors.textSecondary : colors.textPrimary);
  return (
    <Text
      allowFontScaling
      accessibilityRole={variant.startsWith('title') ? 'header' : undefined}
      style={[
        styles[variant],
        { fontSize: fontSizes[variant] * textScale, lineHeight: fontSizes[variant] * textScale * 1.4,
          fontFamily: bold || variant.startsWith('title') ? fonts.bold : fonts.regular, letterSpacing: 0,
          color: textColor },
        bold && styles.bold,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSizes.title, fontWeight: '700', lineHeight: fontSizes.title * 1.3 },
  titleLarge: {
    fontSize: fontSizes.titleLarge,
    fontWeight: '700',
    lineHeight: fontSizes.titleLarge * 1.3,
  },
  body: { fontSize: fontSizes.body, lineHeight: fontSizes.body * 1.4 },
  bodyLarge: { fontSize: fontSizes.bodyLarge, lineHeight: fontSizes.bodyLarge * 1.4 },
  caption: { fontSize: fontSizes.caption },
  bold: { fontWeight: '700' },
});
