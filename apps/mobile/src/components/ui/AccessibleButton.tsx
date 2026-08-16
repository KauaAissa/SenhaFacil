import { Pressable, StyleSheet, ActivityIndicator, type GestureResponderEvent } from 'react-native';
import { AccessibleText } from './AccessibleText';
import { colors, spacing, touchTarget } from '../../theme/theme';

type Variant = 'primary' | 'secondary' | 'danger';

interface AccessibleButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

/**
 * Large, high-contrast, single-purpose button.
 *
 * Accessibility:
 *   - Minimum 56px touch target (exceeds WCAG 44px recommendation)
 *   - `accessibilityRole="button"` + optional hint for screen readers (TalkBack/VoiceOver)
 *   - Disabled/loading states are visually distinct AND announced via accessibilityState
 */
export function AccessibleButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
}: AccessibleButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <AccessibleText variant="bodyLarge" bold color="#FFFFFF">
          {label}
        </AccessibleText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.minHeight,
    borderRadius: touchTarget.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.textSecondary },
  danger: { backgroundColor: colors.danger },
  disabled: { backgroundColor: colors.disabled },
  pressed: { opacity: 0.85 },
});
