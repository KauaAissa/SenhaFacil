import { useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/useThemeColors';
import { spacing, radii, touchTarget } from '../../theme/theme';
import { AccessibleText } from './AccessibleText';
import type { IconName } from './Presentation';

export function ChoiceChip({ label, selected, onPress, icon, disabled = false }: {
  label: string; selected: boolean; onPress: () => void; icon?: IconName; disabled?: boolean;
}) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const foreground = disabled ? colors.inverse : selected ? colors.inverse : colors.textPrimary;
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    aria-pressed={Platform.OS === 'web' ? selected : undefined} aria-disabled={disabled}
    accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({ minHeight: touchTarget.minHeight, minWidth: touchTarget.minWidth,
      maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radii.md, borderWidth: focused ? 3 : 1,
      borderColor: focused ? colors.accent : selected ? colors.primary : colors.inputBorder,
      backgroundColor: disabled ? colors.disabled : selected ? colors.primary : pressed ? colors.primarySoft : colors.surface })}>
    {(selected || icon) && <Ionicons name={selected ? 'checkmark-circle' : icon} size={20} color={foreground} accessible={false} aria-hidden />}
    <AccessibleText variant="caption" bold={selected} color={foreground} style={{ flexShrink: 1, textAlign: 'center' }}>{label}</AccessibleText>
  </Pressable>;
}
