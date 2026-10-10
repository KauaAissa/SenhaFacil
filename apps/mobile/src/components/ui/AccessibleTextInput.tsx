import { View, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { AccessibleText } from './AccessibleText';
import { colors, fontSizes, spacing, touchTarget } from '../../theme/theme';
import { useAccessibilityStore } from '../../stores/accessibility.store';
import { useState } from 'react';
import { fonts } from '../../theme/theme';

interface AccessibleTextInputProps extends TextInputProps {
  label: string;
  errorMessage?: string;
}

/**
 * Labeled text input with large font size and a visible high-contrast border.
 * The label is always rendered above the field (never as placeholder-only)
 * so screen readers and low-vision users always have persistent context.
 */
export function AccessibleTextInput({
  label,
  errorMessage,
  style,
  onFocus,
  onBlur,
  ...rest
}: AccessibleTextInputProps) {
  const { textScale, highContrast } = useAccessibilityStore();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrapper}>
      <AccessibleText variant="body" bold>
        {label}
      </AccessibleText>
      <TextInput
        style={[styles.input, { fontSize: fontSizes.bodyLarge * textScale, fontFamily: fonts.regular }, focused && { borderColor: colors.primary, backgroundColor: colors.surface }, highContrast && { borderColor: '#000000' }, Boolean(errorMessage) && styles.inputError, style]}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        {...rest}
      />
      {errorMessage ? (
        <AccessibleText variant="caption" color={colors.danger}>
          {errorMessage}
        </AccessibleText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  input: {
    minHeight: touchTarget.minHeight,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    borderRadius: touchTarget.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSizes.bodyLarge,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    backgroundColor: colors.background,
  },
  inputError: { borderColor: colors.danger },
});
