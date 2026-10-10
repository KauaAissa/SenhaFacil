import { Pressable, Switch, View } from 'react-native';
import { AccessibleText } from './AccessibleText';
import { colors, spacing, touchTarget } from '../../theme/theme';
import { useAccessibilityStore } from '../../stores/accessibility.store';

export function AccessibleSwitch({ label, description, value, onValueChange, disabled = false }: {
  label: string; description?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean;
}) {
  const highContrast = useAccessibilityStore((state) => state.highContrast);
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={description}
    aria-checked={value} aria-disabled={disabled}
    accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onValueChange(!value)}
    style={{ minHeight: touchTarget.minHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
    <View style={{ flex: 1 }}><AccessibleText>{label}</AccessibleText>
      {description ? <AccessibleText variant="caption">{description}</AccessibleText> : null}</View>
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Switch value={value} disabled={disabled} accessible={false} tabIndex={-1}
        trackColor={{ false: colors.textSecondary, true: highContrast ? '#000000' : colors.primary }} />
    </View>
  </Pressable>;
}