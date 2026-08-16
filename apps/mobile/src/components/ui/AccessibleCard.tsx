import { Pressable, View, StyleSheet, type GestureResponderEvent } from 'react-native';
import { colors, spacing, touchTarget } from '../../theme/theme';

interface AccessibleCardProps {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  highlight?: boolean;
}

/**
 * Card container with generous padding and a visible border (not just shadow —
 * shadows alone are insufficient contrast cues for low-vision users).
 *
 * When `onPress` is provided, the whole card becomes a single accessible touch
 * target instead of relying on nested small buttons.
 */
export function AccessibleCard({
  children,
  onPress,
  accessibilityLabel,
  highlight = false,
}: AccessibleCardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.card,
          highlight && styles.highlight,
          pressed && styles.pressed,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.card, highlight && styles.highlight]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    minHeight: touchTarget.minHeight,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: touchTarget.borderRadius,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  highlight: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  pressed: { opacity: 0.8 },
});
