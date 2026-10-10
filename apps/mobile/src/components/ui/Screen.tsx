import { ScrollView, View, KeyboardAvoidingView, Platform, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme/theme';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}

/**
 * Standard screen wrapper: safe-area aware, consistent padding, high-contrast
 * background. Use for every route to keep spacing and insets consistent.
 */
export function Screen({ children, scroll = true, style }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={{ flex: 1 }} entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}>
          {scroll ? <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            style={{ flex: 1 }} contentContainerStyle={[styles.scrollContent, style]}>{children}</ScrollView>
            : <View style={[styles.container, style]}>{children}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  scrollContent: { padding: spacing.lg, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 },
});
