import { useCallback, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { securityApiService, type SecuritySession } from '../services/security-api.service';
import { useAuthStore } from '../stores/auth.store';
import { getErrorMessage } from '../services/error-messages';
import { Screen } from './ui/Screen';
import { AccessibleCard } from './ui/AccessibleCard';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleTextInput } from './ui/AccessibleTextInput';
import { AccessibleButton } from './ui/AccessibleButton';
import { LoadingState, Notice, ScreenHeading, SectionHeading, StatusPill } from './ui/Presentation';
import { spacing } from '../theme/theme';

export default function SecuritySessionsScreen() {
  const router = useRouter();
  const revokeSessions = useAuthStore((state) => state.revokeSecuritySessions);
  const [items, setItems] = useState<SecuritySession[]>([]);
  const [total, setTotal] = useState(0);
  const [currentId, setCurrentId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const owner = useAuthStore.getState().user?.id;
    const current = () => active.current && controller.current === request && !request.signal.aborted &&
      useAuthStore.getState().user?.id === owner && !useAuthStore.getState().isLocked;
    setLoading(true);
    try {
      const page = await securityApiService.sessions(request.signal);
      if (!current()) return;
      setItems(page.items); setTotal(page.total); setCurrentId(page.currentSessionId); setError('');
    } catch (error) { if (current()) setError(getErrorMessage(error, 'Não foi possível conferir suas sessões.')); }
    finally { if (current()) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    active.current = true; void load();
    return () => { active.current = false; controller.current?.abort(); controller.current = null; setPassword(''); setItems([]); };
  }, [load]));
  function revoke(sessionId?: string) {
    if (!password || busy) return;
    const entered = password; setPassword('');
    const owner = useAuthStore.getState().user?.id;
    Alert.alert('Encerrar sessão online?', 'Isso impede novas operações online nessa sessão. Não apaga cópias do cofre em aparelhos offline.', [
      { text: 'Cancelar', style: 'cancel' }, { text: sessionId ? 'Encerrar sessão' : 'Encerrar outras sessões', onPress: async () => {
        if (!active.current || useAuthStore.getState().user?.id !== owner) return;
        setBusy(true);
        try { const count = await revokeSessions(entered, sessionId); if (active.current) { await load(); Alert.alert('Sessões encerradas', `${count} sessão(ões) encerrada(s).`); } }
        catch (error) { if (active.current) setError(getErrorMessage(error, 'Confira a senha mestra e a conexão.')); }
        finally { if (active.current) setBusy(false); }
      } },
    ]);
  }
  return <Screen>
    <ScreenHeading title="Minhas sessões" icon="phone-portrait-outline" description="Veja entradas da sua conta e encerre o que não reconhece." onBack={() => router.back()} />
    <Notice tone="warning">O nome do sistema é informado pelo aplicativo, não uma prova do aparelho. Sessões antigas podem aparecer sem identificação. Encerrar não apaga dados offline.</Notice>
    {Boolean(error) && <Notice tone="danger">{error}</Notice>}
    <AccessibleCard>
      <SectionHeading title="Confirmar o encerramento" description="Use sua senha mestra. O bloqueio do celular não substitui a confirmação no servidor." />
      <AccessibleTextInput label="Senha mestra" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} editable={!busy} />
      <AccessibleButton label="Encerrar todas as outras sessões" icon="log-out-outline" disabled={!password || busy || total < 2} onPress={() => revoke()} />
      <View style={{ marginTop: spacing.sm }}><AccessibleButton label="Atualizar sessões" variant="quiet" loading={loading} onPress={() => void load()} /></View>
    </AccessibleCard>
    {loading && !items.length && <LoadingState label="Conferindo sessões..." />}
    {total > items.length && <Notice tone="neutral">Mostrando as 50 sessões mais recentes. Encerrar todas as outras alcança também as que não aparecem na lista.</Notice>}
    {items.map((item) => <AccessibleCard key={item.id}>
      <StatusPill label={item.id === currentId ? 'Esta sessão' : item.devicePlatform === 'ANDROID' ? 'Aplicativo Android'
        : item.devicePlatform === 'IOS' ? 'Aplicativo iOS' : item.devicePlatform === 'WEB' ? 'Cliente web informado' : 'Sessão sem identificação'} icon="phone-portrait-outline" />
      <AccessibleText style={{ marginTop: spacing.md }}>Entrada em {new Date(item.createdAt).toLocaleString('pt-BR')}</AccessibleText>
      {item.id !== currentId && <View style={{ marginTop: spacing.md }}>
        <AccessibleButton label="Encerrar esta sessão" variant="secondary" disabled={!password || busy} onPress={() => revoke(item.id)} />
      </View>}
    </AccessibleCard>)}
  </Screen>;
}
