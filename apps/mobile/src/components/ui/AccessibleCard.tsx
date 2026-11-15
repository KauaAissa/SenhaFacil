import { Pressable, View, StyleSheet, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { spacing, radii, touchTarget } from '../../theme/theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useState } from 'react';

interface AccessibleCardProps {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
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
  style,
}: AccessibleCardProps) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const appearance = { backgroundColor: colors.surface, borderColor: focused ? colors.accent : highlight ? colors.primary : colors.border,
    borderWidth: focused || highlight ? 2 : 1 };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          styles.card,
          appearance,
          pressed && { backgroundColor: colors.primarySoft },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.card, appearance, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    minHeight: touchTarget.minHeight,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    elevation: 1,
  },
});
