import { AppState, Pressable, View, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AccessibleText } from './AccessibleText';
import { fontSizes, spacing, touchTarget } from '../../theme/theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAccessibilityStore } from '../../stores/accessibility.store';
import { useContext, useEffect, useRef, useState } from 'react';
import { fonts } from '../../theme/theme';
import { KeyboardFocusContext } from './KeyboardFocusContext';

interface AccessibleTextInputProps extends TextInputProps {
  label: string;
  errorMessage?: string;
  hint?: string;
}

/**
 * Labeled text input with large font size and a visible high-contrast border.
 * The label is always rendered above the field (never as placeholder-only)
 * so screen readers and low-vision users always have persistent context.
 */
export function AccessibleTextInput({
  label,
  errorMessage,
  hint,
  style,
  onFocus,
  onBlur,
  secureTextEntry = false,
  ...rest
}: AccessibleTextInputProps) {
  const textScale = useAccessibilityStore((state) => state.textScale);
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const input = useRef<TextInput>(null);
  const ensureVisible = useContext(KeyboardFocusContext);
  useEffect(() => {
    if (!secureTextEntry) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setVisible(false);
    });
    return () => subscription.remove();
  }, [secureTextEntry]);
  useEffect(() => { if (!rest.value) setVisible(false); }, [rest.value]);
  return (
    <View style={styles.wrapper}>
      <AccessibleText variant="body" bold>
        {label}
      </AccessibleText>
      <View style={[styles.field, { backgroundColor: focused ? colors.primarySoft : colors.surface,
        borderColor: errorMessage ? colors.danger : focused ? colors.primary : colors.inputBorder }]}>
      <TextInput
        {...rest}
        ref={input}
        style={[styles.input, { fontSize: fontSizes.bodyLarge * textScale, fontFamily: fonts.regular,
          color: colors.textPrimary }, style]}
        secureTextEntry={secureTextEntry && !visible}
        autoCapitalize={secureTextEntry ? 'none' : rest.autoCapitalize}
        autoCorrect={secureTextEntry ? false : rest.autoCorrect}
        spellCheck={secureTextEntry ? false : rest.spellCheck}
        onFocus={(event) => {
          setFocused(true);
          if (input.current) ensureVisible(input.current);
          onFocus?.(event);
        }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        accessibilityHint={errorMessage || hint}
        selectionColor={colors.primary}
        allowFontScaling
        textAlignVertical={rest.multiline ? 'top' : 'center'}
      />
      {secureTextEntry && <Pressable
        onPress={() => setVisible((current) => !current)}
        disabled={rest.editable === false}
        accessibilityRole="button"
        accessibilityLabel={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLocaleLowerCase('pt-BR')}`}
        accessibilityState={{ disabled: rest.editable === false, selected: visible }}
        style={({ pressed }) => [styles.visibility, { backgroundColor: pressed ? colors.primarySoft : 'transparent' }]}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={24} color={colors.primary} accessible={false} />
        <AccessibleText variant="caption" bold color={colors.primary}>{visible ? 'Ocultar' : 'Ver'}</AccessibleText>
      </Pressable>}
      </View>
      {errorMessage ? (
        <AccessibleText variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
          {errorMessage}
        </AccessibleText>
      ) : hint ? <AccessibleText variant="caption" style={{ marginTop: spacing.xs }}>{hint}</AccessibleText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: touchTarget.borderRadius, marginTop: spacing.xs },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: touchTarget.minHeight,
    borderRadius: touchTarget.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: fontSizes.bodyLarge,
  },
  visibility: { minWidth: touchTarget.minWidth, minHeight: touchTarget.minHeight,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
