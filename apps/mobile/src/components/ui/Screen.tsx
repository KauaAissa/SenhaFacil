import { ScrollView, View, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions, type TextInput, type ViewStyle } from 'react-native';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../../theme/theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { KeyboardFocusContext, TabScreenContext } from './KeyboardFocusContext';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  getKeyboardScrollResponder?: () => Pick<ScrollView, 'scrollResponderScrollNativeHandleToKeyboard'> | null;
}

/**
 * Standard screen wrapper: safe-area aware, consistent padding, high-contrast
 * background. Use for every route to keep spacing and insets consistent.
 */
export function Screen({ children, scroll = true, style, getKeyboardScrollResponder }: ScreenProps) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const insideTabs = useContext(TabScreenContext);
  const scrollView = useRef<ScrollView>(null);
  const focusedInput = useRef<TextInput | null>(null);
  const frame = useRef<number | null>(null);
  const scrollToInput = useCallback((input: TextInput) => {
    focusedInput.current = input;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const responder = scrollView.current ?? getKeyboardScrollResponder?.();
      if (input.isFocused()) responder?.scrollResponderScrollNativeHandleToKeyboard(input, spacing.lg, true);
    });
  }, [getKeyboardScrollResponder]);
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (focusedInput.current?.isFocused()) scrollToInput(focusedInput.current);
    });
    return () => {
      subscription.remove();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [scrollToInput]);
  const padding = { paddingHorizontal: width < 380 ? spacing.md : spacing.lg };
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={insideTabs ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={{ flex: 1 }} entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}>
          <KeyboardFocusContext.Provider value={scrollToInput}>
          {scroll ? <ScrollView ref={scrollView} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets onLayout={() => {
              if (focusedInput.current?.isFocused()) scrollToInput(focusedInput.current);
            }}
            style={{ flex: 1 }} contentContainerStyle={[styles.scrollContent, padding, style]}>{children}</ScrollView>
            : <View style={[styles.container, padding, style]}>{children}</View>}
          </KeyboardFocusContext.Provider>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  scrollContent: { padding: spacing.lg, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 },
});
