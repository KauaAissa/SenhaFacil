import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import appIcon from '../../assets/icon.png';
import { useThemeColors } from '../hooks/useThemeColors';
import { spacing } from '../theme/theme';
import { AccessibleText } from './ui/AccessibleText';

export default function StartupScreen({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const scale = useSharedValue(reducedMotion ? 1 : 0.96);
  const [entered, setEntered] = useState(reducedMotion);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  useEffect(() => {
    if (reducedMotion) { setEntered(true); return; }
    opacity.value = withTiming(1, { duration: 360 });
    scale.value = withTiming(1, { duration: 360 }, (finished) => {
      if (finished) runOnJS(setEntered)(true);
    });
  }, [opacity, scale, reducedMotion]);

  useEffect(() => {
    if (!ready || !entered) return;
    if (reducedMotion) { onFinished(); return; }
    opacity.value = withTiming(0, { duration: 160 }, (finished) => {
      if (finished) runOnJS(onFinished)();
    });
  }, [ready, entered, reducedMotion, onFinished, opacity]);

  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, backgroundColor: colors.background }}>
    <Animated.View style={[style, { alignItems: 'center', gap: spacing.lg, maxWidth: 480 }]}
      accessible accessibilityLabel="Senha Fácil. Preparando seu cofre." accessibilityRole="progressbar">
      <Image source={appIcon} accessible={false} style={{ width: 104, height: 104, borderRadius: 28 }} />
      <AccessibleText variant="title" style={{ textAlign: 'center' }}>Senha Fácil</AccessibleText>
      <AccessibleText style={{ textAlign: 'center' }} color={colors.textSecondary}>Cuidado com a sua vida digital</AccessibleText>
    </Animated.View>
  </View>;
}
