import { Pressable, StyleSheet, ActivityIndicator, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AccessibleText } from './AccessibleText';
import { spacing, touchTarget } from '../../theme/theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useState } from 'react';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet';

interface AccessibleButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  expanded?: boolean;
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
  expanded,
}: AccessibleButtonProps) {
  const isDisabled = disabled || loading;
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const scale = useSharedValue(1);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const filled = variant === 'primary' || variant === 'danger';
  const foreground = isDisabled || filled ? colors.inverse : colors.primary;
  const backgroundColor = isDisabled ? colors.disabled : variant === 'primary' ? colors.primary
    : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.primarySoft : 'transparent';

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.98, { duration: 100, reduceMotion: ReduceMotion.System }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 140, reduceMotion: ReduceMotion.System }); }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading, expanded }}
      aria-disabled={isDisabled}
      aria-busy={loading}
      aria-expanded={expanded}
      style={[
        styles.base,
        motion,
        { backgroundColor, borderColor: focused ? colors.accent : variant === 'quiet' ? 'transparent' : isDisabled ? colors.disabled : variant === 'danger' ? colors.danger : colors.primary },
        focused && { borderWidth: 3 },
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} accessible={false} />
        : icon && <Ionicons name={icon} size={23} color={foreground} accessible={false} aria-hidden />}
      <AccessibleText variant="body" bold color={foreground} style={{ flexShrink: 1, textAlign: 'center' }}>{label}</AccessibleText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.minHeight,
    minWidth: touchTarget.minWidth,
    borderWidth: 1,
    borderRadius: touchTarget.borderRadius,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
});
