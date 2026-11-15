import { useCallback, useEffect, useRef, useState } from 'react';
import { View, AppState, Platform, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { listenPushTokenChanges } from '../services/push-notifications.service';
import { accessApiService, parseAccessNotification } from '../services/access-api.service';
import { useAuthStore, type UnlockMethod } from '../stores/auth.store';
import { spacing } from '../theme/theme';
import { Screen } from '../components/ui/Screen';
import { AccessibleTextInput } from '../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../components/ui/AccessibleButton';
import { useAccessibilityStore } from '../stores/accessibility.store';
import OnboardingScreen from '../components/OnboardingScreen';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useFonts, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold } from '@expo-google-fonts/atkinson-hyperlegible';
import RecoveryKitGate from '../components/RecoveryKitGate';
import { useReducedMotion } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { AccessibleCard } from '../components/ui/AccessibleCard';
import { HeroCard, Notice, SectionHeading } from '../components/ui/Presentation';
import { SupportTools } from '../components/SupportTools';
import StartupScreen from '../components/StartupScreen';
import { getErrorMessage } from '../services/error-messages';
import { accountLogin } from '../services/input-validation';

/**
 * Root layout — runs session bootstrap once and gates all routing on it.
 * Each route group ((auth), (elderly), (caregiver)) has its own guard
 * (see useRequireRole) that redirects based on the resolved session.
 */
export default function RootLayout() {
  return <><StatusBar style="dark" />{Platform.OS !== 'web' && <NativeScreenProtection />}<RootContent /></>;
}

function NativeScreenProtection() {
  usePreventScreenCapture('senha-facil');
  return null;
}

function RootContent() {
  const reducedMotion = useReducedMotion();
  const [fontsLoaded, fontError] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold });
  const { bootstrap, isReady, user, isLocked, isLoading, error, unlock, lockAutomatically, logout, needsOnboarding, biometrics, deviceLock, refreshBiometrics } = useAuthStore();
  const [password, setPassword] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const [startupFinished, setStartupFinished] = useState(false);
  const finishStartup = useCallback(() => setStartupFinished(true), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => { setNotificationError(''); }, [user?.id]);

  function resetTimer() {
    if (timer.current) clearTimeout(timer.current);
    if (user && !isLocked) timer.current = setTimeout(lockAutomatically, 120_000);
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
        if (data.type === 'SECURITY_EVENT') {
          router.push({ pathname: user?.role === 'CAREGIVER' ? '/(caregiver)/security-activity' : '/(elderly)/security-activity',
            params: { eventId: data.eventId } });
        } else if (data.type === 'ACCESS_REQUEST' && user?.role === 'CAREGIVER') router.push('/(caregiver)/requests');
        else if (data.type === 'EMERGENCY_ACCESS' && user?.role === 'CAREGIVER') router.push('/(caregiver)/history');
        else if (data.type === 'ACCESS_RESOLVED' && user?.role === 'ELDERLY') {
          const state = await accessApiService.state(data.accessLogId);
          const current = useAuthStore.getState();
          if (!active || current.isLocked || current.user?.id !== user.id) return;
          router.push({ pathname: '/(elderly)/vault/[id]', params: { id: state.vaultItemId } });
        } else return;
        await Notifications.clearLastNotificationResponseAsync();
      } catch (error) {
        if (active) setNotificationError(getErrorMessage(error, 'Não foi possível abrir esta notificação. Confira a lista de solicitações ou o histórico.'));
      }
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => { void openNotification(response); });
    void Notifications.getLastNotificationResponseAsync().then(openNotification).catch((error) => {
      if (active) setNotificationError(getErrorMessage(error, 'Não foi possível consultar a última notificação. Você ainda pode abrir a lista de solicitações.'));
    });
    return () => { active = false; subscription.remove(); stopTokenListener(); };
  }, [user?.id, user?.role, isLocked, needsOnboarding, router]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user, isLocked, lockAutomatically]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPassword('');
      useAuthStore.getState().handleAppStateChange(state);
      if (state === 'active') void useAuthStore.getState().refreshBiometrics();
    });
    return () => subscription.remove();
  }, []);

  async function handleUnlock(method: UnlockMethod | 'password') {
    const entered = password;
    setPassword('');
    await unlock(method === 'password' ? entered : undefined, method === 'device' ? 'device' : 'biometric').catch(() => undefined);
  }

  async function handleLogout() {
    setPassword('');
    try { await logout(); }
    catch (error) { Alert.alert('Saída não concluída', getErrorMessage(error, 'Não foi possível limpar a sessão deste aparelho. Feche o aplicativo e tente novamente.')); }
  }

  if (!startupFinished || !isReady || (!fontsLoaded && !fontError)) {
    return <StartupScreen ready={isReady && (fontsLoaded || Boolean(fontError))} onFinished={finishStartup} />;
  }

  if (user && isLocked) {
    return (
      <Screen style={{ maxWidth: 560 }}>
        <HeroCard title="Seu cofre fez uma pausa" eyebrow={user.name} icon="lock-closed-outline"
          description="Confirme que é você para continuar de onde parou." />
        <AccessibleCard>
        <SectionHeading title="Cofre bloqueado" description={deviceLock?.enabled
          ? 'Use o bloqueio deste celular. A biometria ativada e a senha mestra são alternativas.'
          : 'Use sua senha mestra ou a biometria ativada. Para usar o bloqueio do celular, ative em Minha conta → Segurança.'} />
        {Boolean(error) && <Notice tone="danger">{error}</Notice>}
        <View style={{ gap: spacing.md }}>
          {deviceLock?.enabled && deviceLock.available && <AccessibleButton label="Usar bloqueio do celular" icon="phone-portrait-outline" loading={isLoading} onPress={() => void handleUnlock('device')} />}
          {deviceLock?.enabled && !deviceLock.available && <Notice tone="warning">{deviceLock.reason}</Notice>}
          {biometrics?.enabled && biometrics.available && <AccessibleButton label={`Usar ${biometrics.label}`} icon="finger-print-outline" variant="secondary" disabled={isLoading} onPress={() => void handleUnlock('biometric')} />}
          {biometrics?.enabled && !biometrics.available && <Notice tone="warning">{biometrics.reason}</Notice>}
          {biometrics?.enabled && !biometrics.available && <AccessibleButton label="Verificar biometria novamente" variant="quiet" disabled={isLoading} onPress={() => void refreshBiometrics()} />}
          <AccessibleTextInput label="Senha mestra" value={password} onChangeText={setPassword} secureTextEntry />
          <AccessibleButton label="Desbloquear com senha mestra" icon="lock-open-outline"
            variant={deviceLock?.enabled && deviceLock.available ? 'secondary' : 'primary'}
            loading={isLoading} disabled={!password} onPress={() => void handleUnlock('password')} />
        </View>
        </AccessibleCard>
        <AccessibleButton label="Sair desta conta" icon="log-out-outline" variant="quiet" disabled={isLoading} onPress={() => void handleLogout()} />
        <SupportTools />
      </Screen>
    );
  }

  const content = user && needsOnboarding ? <OnboardingScreen /> : <Stack screenOptions={{ headerShown: false, animation: reducedMotion ? 'none' : 'fade' }} />;
  return <View style={{ flex: 1 }} onTouchStart={resetTimer}>
    {user && Boolean(notificationError) && <View style={{ padding: spacing.md }}>
      <Notice tone="warning">{notificationError}</Notice>
      <AccessibleButton label="Fechar aviso" variant="quiet" onPress={() => setNotificationError('')} />
    </View>}
    {user ? <RecoveryKitGate key={user.id} identifier={accountLogin(user)}
    recoverySalt={useAuthStore.getState().getRecoverySalt()}>{content}</RecoveryKitGate> : content}</View>;
}
