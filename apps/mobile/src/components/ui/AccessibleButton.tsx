import { Pressable, StyleSheet, ActivityIndicator, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AccessibleText } from './AccessibleText';
import { colors, spacing, touchTarget } from '../../theme/theme';
import { useAccessibilityStore } from '../../stores/accessibility.store';

type Variant = 'primary' | 'secondary' | 'danger';

interface AccessibleButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
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
  icon,
}: AccessibleButtonProps) {
  const isDisabled = disabled || loading;
  const highContrast = useAccessibilityStore((state) => state.highContrast);

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
        highContrast && { backgroundColor: '#000000' },
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={24} color="#FFFFFF" accessible={false} />}
          <AccessibleText variant="bodyLarge" bold color="#FFFFFF" style={{ flexShrink: 1, textAlign: 'center' }}>{label}</AccessibleText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.minHeight,
    borderRadius: touchTarget.borderRadius,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
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
