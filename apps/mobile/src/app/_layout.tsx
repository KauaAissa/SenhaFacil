import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, AppState, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { listenPushTokenChanges } from '../services/push-notifications.service';
import { accessApiService, parseAccessNotification } from '../services/access-api.service';
import { useAuthStore } from '../stores/auth.store';
import { colors } from '../theme/theme';
import { Screen } from '../components/ui/Screen';
import { AccessibleText } from '../components/ui/AccessibleText';
import { AccessibleTextInput } from '../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../components/ui/AccessibleButton';
import { useAccessibilityStore } from '../stores/accessibility.store';
import OnboardingScreen from '../components/OnboardingScreen';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useFonts, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold } from '@expo-google-fonts/atkinson-hyperlegible';
import RecoveryKitGate from '../components/RecoveryKitGate';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Root layout — runs session bootstrap once and gates all routing on it.
 * Each route group ((auth), (elderly), (caregiver)) has its own guard
 * (see useRequireRole) that redirects based on the resolved session.
 */
export default function RootLayout() {
  return <>{Platform.OS !== 'web' && <NativeScreenProtection />}<RootContent /></>;
}

function NativeScreenProtection() {
  usePreventScreenCapture('senha-facil');
  return null;
}

function RootContent() {
  const reducedMotion = useReducedMotion();
  const [fontsLoaded, fontError] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold });
  const { bootstrap, isReady, user, isLocked, isLoading, error, unlock, lock, logout, needsOnboarding } = useAuthStore();
  const [password, setPassword] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  function resetTimer() {
    if (timer.current) clearTimeout(timer.current);
    if (user && !isLocked) timer.current = setTimeout(lock, 120_000);
  }

  useEffect(() => {
    void bootstrap();
    void useAccessibilityStore.getState().hydrate();
  }, [bootstrap]);

  useEffect(() => {
    if (!user || isLocked || needsOnboarding) return;
    const stopTokenListener = listenPushTokenChanges();
    let active = true;
    async function openNotification(response: Notifications.NotificationResponse | null) {
      if (!response || !active) return;
      const data = parseAccessNotification(response.notification.request.content.data);
      if (!data) return;
      const session = useAuthStore.getState();
      if (session.isLocked || session.user?.id !== user?.id) return;
      try {
        if (data.type === 'ACCESS_REQUEST' && user?.role === 'CAREGIVER') router.push('/(caregiver)/requests');
        else if (data.type === 'EMERGENCY_ACCESS' && user?.role === 'CAREGIVER') router.push('/(caregiver)/history');
        else if (data.type === 'ACCESS_RESOLVED' && user?.role === 'ELDERLY') {
          const state = await accessApiService.state(data.accessLogId);
          const current = useAuthStore.getState();
          if (!active || current.isLocked || current.user?.id !== user.id) return;
          router.push({ pathname: '/(elderly)/vault/[id]', params: { id: state.vaultItemId } });
        } else return;
        await Notifications.clearLastNotificationResponseAsync();
      } catch {}
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => { void openNotification(response); });
    void Notifications.getLastNotificationResponseAsync().then(openNotification).catch(() => undefined);
    return () => { active = false; subscription.remove(); stopTokenListener(); };
  }, [user?.id, user?.role, isLocked, needsOnboarding, router]);

  useEffect(() => {
    resetTimer();
    if (AppState.currentState !== 'active' && user && !isLocked && !isLoading) lock();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPassword('');
      const session = useAuthStore.getState();
      if (state !== 'active' && session.user && !session.isLocked && !session.isLoading) session.lock();
    });
    return () => {
      subscription.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user, isLocked, isLoading, lock]);

  async function handleUnlock(withPassword: boolean) {
    const entered = password;
    setPassword('');
    await unlock(withPassword ? entered : undefined).catch(() => undefined);
  }

  if (!isReady || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (user && isLocked) {
    return (
      <Screen>
        <AccessibleText variant="title">Cofre bloqueado</AccessibleText>
        <AccessibleText variant="body">{user.name}</AccessibleText>
        <AccessibleTextInput label="Senha mestra" value={password} onChangeText={setPassword} secureTextEntry />
        {Boolean(error) && <AccessibleText variant="body" color={colors.danger} accessibilityLiveRegion="polite">{error}</AccessibleText>}
        <View style={{ gap: 16 }}>
          <AccessibleButton label="Desbloquear com senha" icon="lock-open-outline" loading={isLoading} disabled={!password} onPress={() => void handleUnlock(true)} />
          <AccessibleButton label="Usar biometria" icon="finger-print-outline" variant="secondary" disabled={isLoading} onPress={() => void handleUnlock(false)} />
          <AccessibleButton label="Sair desta conta" icon="log-out-outline" variant="secondary" disabled={isLoading} onPress={() => { setPassword(''); void logout(); }} />
        </View>
      </Screen>
    );
  }

  const content = user && needsOnboarding ? <OnboardingScreen /> : <Stack screenOptions={{ headerShown: false, animation: reducedMotion ? 'none' : 'fade' }} />;
  return <View style={{ flex: 1 }} onTouchStart={resetTimer}>{user ? <RecoveryKitGate key={user.id} email={user.email}
    recoverySalt={useAuthStore.getState().getRecoverySalt()}>{content}</RecoveryKitGate> : content}</View>;
}
