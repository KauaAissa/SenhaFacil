import { Platform, Pressable, View } from 'react-native';
import { AccessibleText } from './AccessibleText';
import { spacing, touchTarget } from '../../theme/theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useState, type KeyboardEvent } from 'react';

export function AccessibleSwitch({ label, description, value, onValueChange, disabled = false }: {
  label: string; description?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean;
}) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  // React Native Web handles Space for buttons, but not for switch roles.
  const keyboardProps = Platform.OS === 'web' ? {
    onKeyDownCapture: (event: KeyboardEvent) => {
      if (event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (!disabled && !event.repeat) onValueChange(!value);
    },
  } : {};
  return <Pressable {...keyboardProps} accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={description}
    aria-checked={value} aria-disabled={disabled}
    accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onValueChange(!value)}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={{ minHeight: touchTarget.minHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm,
      borderWidth: 2, borderColor: focused ? colors.accent : 'transparent', borderRadius: touchTarget.borderRadius }}>
    <View style={{ flex: 1 }}><AccessibleText bold>{label}</AccessibleText>
      {description ? <AccessibleText variant="caption">{description}</AccessibleText> : null}</View>
    {/* The track is decorative: only the labeled row receives focus or input. */}
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
      style={{ width: 52, height: 32, flexShrink: 0, borderRadius: 16, borderWidth: 2, padding: 3,
        borderColor: disabled ? colors.disabled : value ? colors.primary : colors.inputBorder,
        backgroundColor: value ? colors.primary : colors.surfaceMuted, opacity: disabled ? 0.55 : 1,
        alignItems: value ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: value ? colors.inverse : colors.textSecondary }} />
    </View>
  </Pressable>;
}