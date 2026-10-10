import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { AccessibleTextInput } from '../../../components/ui/AccessibleTextInput';
import { useAuthStore } from '../../../stores/auth.store';
import { vaultService } from '../../../services/vault.service';
import { accessApiService } from '../../../services/access-api.service';
import { accessSocketService } from '../../../services/access-socket.service';
import { connectivityService } from '../../../services/connectivity.service';
import { sensitiveClipboard } from '../../../services/clipboard.service';
import type { DecryptedVaultItem, LocalVaultItem } from '../../../services/offline-vault.service';
import { colors, spacing } from '../../../theme/theme';

type GateState =
  | 'loading'
  | 'locked'
  | 'requesting'
  | 'waiting'
  | 'denied'
  | 'expired'
  | 'cancelled'
  | 'offline-fallback'
  | 'revealed'
  | 'not-found';

export default function VaultItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [item, setItem] = useState<LocalVaultItem | null>(null);
  const [revealed, setRevealed] = useState<DecryptedVaultItem | null>(null);
  const [gate, setGate] = useState<GateState>('loading');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [emergencyPassword, setEmergencyPassword] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const alive = useRef(false);
  const focusGeneration = useRef(0);
  const accessLogIdRef = useRef<string | null>(null);

  const loadItem = useCallback(async () => {
    const generation = focusGeneration.current;
    const current = () => alive.current && focusGeneration.current === generation;
    const found = await vaultService.getItem(id);
    if (!current()) return;
    setItem(found);
    setRevealed(null);
    if (found && !found.requiresApproval) {
      const value = await vaultService.revealItem(found.id);
      if (!current()) return;
      setRevealed(value);
    }
    setGate(!found ? 'not-found' : found.requiresApproval ? 'locked' : 'revealed');
    if (found?.requiresApproval && connectivityService.isOnline) {
      const history = await accessApiService.history();
      if (!current()) return;
      const pending = history.find((entry) => entry.vaultItem.id === found.id &&
        ['PENDING', 'APPROVED'].includes(entry.status) && new Date(entry.expiresAt).getTime() > Date.now());
      if (pending) {
        accessLogIdRef.current = pending.id;
        setExpiresAt(new Date(pending.expiresAt));
        if (pending.status === 'APPROVED') {
          const value = await vaultService.revealItem(found.id, pending.id);
          if (current()) { setRevealed(value); setGate('revealed'); }
        } else setGate('waiting');
      }
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    const generation = ++focusGeneration.current;
    alive.current = true;
    setRevealed(null); setUsedFallback(false); setExpiresAt(null); setNotes(null);
    accessLogIdRef.current = null;
    void loadItem().catch((error) => {
      if (alive.current && focusGeneration.current === generation) {
        setGate('locked');
        Alert.alert('Nao foi possivel abrir a senha', error instanceof Error ? error.message : 'Tente novamente.');
      }
    });
    return () => { alive.current = false; ++focusGeneration.current; setRevealed(null); setEmergencyPassword(''); void sensitiveClipboard.clear().catch(() => undefined); };
  }, [loadItem]));

  useEffect(() => {
    if (!expiresAt || !['waiting', 'revealed'].includes(gate) || usedFallback) return;
    const timeout = setTimeout(() => { setRevealed(null); setGate('expired'); void sensitiveClipboard.clear().catch(() => undefined); }, Math.max(0, expiresAt.getTime() - Date.now()));
    return () => clearTimeout(timeout);
  }, [expiresAt, gate, usedFallback]);

  useEffect(() => {
    if (gate !== 'waiting') return;
    async function reconcile() {
      const generation = focusGeneration.current;
      const requestId = accessLogIdRef.current;
      if (!requestId || !connectivityService.isOnline) return;
      try {
        const state = await accessApiService.state(requestId);
        if (!alive.current || focusGeneration.current !== generation) return;
        setNotes(state.notes);
        if (state.status === 'APPROVED') {
          const value = await vaultService.revealItem(id, requestId);
          if (alive.current && focusGeneration.current === generation) { setRevealed(value); setGate('revealed'); }
        } else if (state.status === 'DENIED' || state.status === 'EXPIRED' || state.status === 'CANCELLED') {
          setRevealed(null); setGate(state.status === 'CANCELLED' ? 'cancelled' : state.status === 'DENIED' ? 'denied' : 'expired');
          void sensitiveClipboard.clear().catch(() => undefined);
        }
      } catch {}
    }
    void reconcile();
    const interval = setInterval(() => void reconcile(), 3_000);
    return () => clearInterval(interval);
  }, [gate, id]);

  // Listen for real-time resolution while a request is pending.
  useEffect(() => {
    const unsubscribe = accessSocketService.onAccessResolved((event) => {
      if (!alive.current || event.accessLogId !== accessLogIdRef.current) return;
      const generation = focusGeneration.current;
      setNotes(event.notes);

      if (event.status === 'APPROVED' && id) {
        void vaultService.revealItem(id, event.accessLogId).then((value) => { if (alive.current && focusGeneration.current === generation) { setRevealed(value); setGate('revealed'); } })
          .catch(() => { if (alive.current && focusGeneration.current === generation) setGate('expired'); });
      }
      else if (event.status === 'DENIED' || event.status === 'EXPIRED') {
        setRevealed(null); setGate(event.status === 'DENIED' ? 'denied' : 'expired');
        void sensitiveClipboard.clear().catch(() => undefined);
      }
    });
    return unsubscribe;
  }, [id]);

  async function handleRequestAccess() {
    if (!item) return;
    const generation = focusGeneration.current;
    if (!connectivityService.isOnline) { setGate('offline-fallback'); return; }
    setGate('requesting');

    try {
      const result = await accessApiService.requestAccess(item.id);
      if (!alive.current || generation !== focusGeneration.current) return;
      accessLogIdRef.current = result.accessLogId;
      setExpiresAt(new Date(result.expiresAt));
      setGate('waiting');
    } catch (err) {
      if (!alive.current || generation !== focusGeneration.current) return;
      if (!connectivityService.isOnline) {
        setGate('offline-fallback');
      } else {
        Alert.alert('Não foi possível solicitar acesso', err instanceof Error ? err.message : String(err));
        setGate('locked');
      }
    }
  }

  function handleEmergencyReveal(withPassword: boolean) {
    const password = emergencyPassword;
    setEmergencyPassword('');
    Alert.alert(
      'Modo de emergência',
      'Você está sem conexão. Deseja revelar esta senha mesmo assim? Isso ficará registrado para seu familiar quando a conexão voltar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revelar mesmo assim',
          style: 'destructive',
          onPress: async () => {
            const generation = focusGeneration.current;
            if (!alive.current) return;
            try {
              const value = await vaultService.revealEmergency(id,
                () => useAuthStore.getState().reauthenticate(withPassword ? password : undefined));
              if (!alive.current || generation !== focusGeneration.current) return;
              setRevealed(value);
              setUsedFallback(true);
              setGate('revealed');
            } catch (error) {
              Alert.alert('Emergencia nao liberada', error instanceof Error ? error.message : 'Tente novamente.');
            }
          },
        },
      ],
    );
  }

  async function cancelRequest() {
    const requestId = accessLogIdRef.current;
    const generation = focusGeneration.current;
    if (!requestId) return;
    try {
      await accessApiService.cancel(requestId);
      if (alive.current && generation === focusGeneration.current) {
        accessLogIdRef.current = null; setRevealed(null); setExpiresAt(null); setGate('cancelled');
      }
    } catch { Alert.alert('Cancelamento nao concluido', 'O pedido pode ter sido respondido. Confira o estado antes de tentar novamente.'); }
  }

  async function handleDelete() {
    if (!item) return;
    Alert.alert('Excluir senha', `Tem certeza que deseja excluir "${item.label}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await vaultService.deleteItem(item.id);
          router.back();
        },
      },
    ]);
  }

  function handleCopy() {
    const generation = focusGeneration.current;
    Alert.alert('Copiar senha', 'A senha ficara disponivel para colar em outro aplicativo por ate 30 segundos.', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Copiar', onPress: async () => {
        if (!alive.current || generation !== focusGeneration.current || !revealed || (expiresAt && !usedFallback && expiresAt.getTime() <= Date.now())) return;
        try { await sensitiveClipboard.copy(revealed.plaintext.password); Alert.alert('Senha copiada.'); }
        catch { Alert.alert('Nao foi possivel copiar.'); }
      } },
    ]);
  }

  if (gate === 'loading') {
    return (
      <Screen>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (gate === 'not-found' || !item) {
    return (
      <Screen>
        <AccessibleText variant="body">Senha não encontrada.</AccessibleText>
      </Screen>
    );
  }

  return (
    <Screen>
      <AccessibleText variant="title">{item.label}</AccessibleText>

      {gate === 'locked' && (
        <AccessibleCard highlight>
          <AccessibleText variant="body" bold>
            Esta senha requer aprovação
          </AccessibleText>
          <AccessibleText variant="body" style={{ marginVertical: spacing.sm }}>
            Um familiar de confiança precisa autorizar antes que você veja esta senha.
          </AccessibleText>
          <AccessibleButton label="Solicitar acesso ao familiar" onPress={handleRequestAccess} />
        </AccessibleCard>
      )}

      {gate === 'requesting' && (
        <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {gate === 'waiting' && (
        <AccessibleCard>
          <AccessibleText variant="body" bold>
            Aguardando resposta do familiar
          </AccessibleText>
          {expiresAt && (
            <AccessibleText variant="caption" style={{ marginTop: spacing.xs }}>
              Expira às {expiresAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </AccessibleText>
          )}
          <View style={{ marginTop: spacing.md }}><AccessibleButton label="Cancelar pedido" icon="close-outline" variant="secondary" onPress={() => void cancelRequest()} /></View>
        </AccessibleCard>
      )}

      {gate === 'denied' && (
        <AccessibleCard>
          <AccessibleText variant="body" bold color={colors.danger}>
            O familiar negou este acesso.
          </AccessibleText>
          {Boolean(notes) && <AccessibleText variant="body">{notes}</AccessibleText>}
          <View style={{ marginTop: spacing.md }}>
            <AccessibleButton label="Tentar novamente" onPress={() => setGate('locked')} />
          </View>
        </AccessibleCard>
      )}

      {(gate === 'expired' || gate === 'cancelled') && (
        <AccessibleCard>
          <AccessibleText variant="body" bold color={colors.warning}>
            {gate === 'cancelled' ? 'Pedido cancelado.' : 'A solicitação expirou sem resposta.'}
          </AccessibleText>
          <View style={{ marginTop: spacing.md }}>
            <AccessibleButton label="Solicitar novamente" onPress={() => setGate('locked')} />
          </View>
        </AccessibleCard>
      )}

      {gate === 'offline-fallback' && (
        <AccessibleCard highlight>
          <AccessibleText variant="body" bold color={colors.warning}>
            Sem conexão com a internet
          </AccessibleText>
          <AccessibleText variant="body" style={{ marginVertical: spacing.sm }}>
            Não foi possível notificar seu familiar agora. Você pode usar o acesso de emergência.
          </AccessibleText>
          <AccessibleTextInput label="Senha mestra" value={emergencyPassword} onChangeText={setEmergencyPassword} secureTextEntry />
          <AccessibleButton label="Emergencia com senha mestra" variant="danger" disabled={!emergencyPassword} onPress={() => handleEmergencyReveal(true)} />
          <AccessibleButton label="Emergencia com biometria" variant="danger" onPress={() => handleEmergencyReveal(false)} />
        </AccessibleCard>
      )}

      {gate === 'revealed' && revealed && (
        <>
          {usedFallback && (
            <AccessibleCard highlight>
              <AccessibleText variant="caption" color={colors.warning} bold>
                Revelado em modo de emergência (offline)
              </AccessibleText>
            </AccessibleCard>
          )}
          <AccessibleCard>
            {revealed.plaintext.login && (
              <Field label="Login" value={revealed.plaintext.login} />
            )}
            <Field label="Senha" value={revealed.plaintext.password} />
            {revealed.plaintext.url && <Field label="Site" value={revealed.plaintext.url} />}
            {revealed.plaintext.notes && <Field label="Observações" value={revealed.plaintext.notes} />}
          </AccessibleCard>
          <AccessibleButton label="Copiar senha" icon="copy-outline" onPress={handleCopy} />
          <AccessibleButton label="Editar senha" icon="create-outline" variant="secondary"
            onPress={() => router.push({ pathname: '/(elderly)/vault/edit', params: { id: item.id, accessLogId: accessLogIdRef.current ?? '' } })} />
          <AccessibleButton label={item.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} icon={item.isFavorite ? 'star' : 'star-outline'} variant="secondary"
            onPress={async () => { await vaultService.setFavorite(item.id, !item.isFavorite); setItem({ ...item, isFavorite: !item.isFavorite }); }} />
          <AccessibleButton label="Excluir senha" variant="danger" onPress={handleDelete} />
        </>
      )}
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <AccessibleText variant="caption">{label}</AccessibleText>
      <AccessibleText variant="bodyLarge" selectable>
        {value}
      </AccessibleText>
    </View>
  );
}
