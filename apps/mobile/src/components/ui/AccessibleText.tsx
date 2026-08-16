import { Text, type TextProps, StyleSheet } from 'react-native';
import { colors, fontSizes } from '../../theme/theme';

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
  return (
    <Text
      style={[
        styles[variant],
        { color: color ?? colors.textPrimary },
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
  caption: { fontSize: fontSizes.caption, color: colors.textSecondary },
  bold: { fontWeight: '700' },
});
