import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { AccessibleTextInput } from '../../../components/ui/AccessibleTextInput';
import { useAuthStore, type UnlockMethod } from '../../../stores/auth.store';
import { vaultService } from '../../../services/vault.service';
import { apiClient } from '../../../services/api.client';
import { accessApiService } from '../../../services/access-api.service';
import { accessSocketService } from '../../../services/access-socket.service';
import { connectivityService } from '../../../services/connectivity.service';
import { sensitiveClipboard } from '../../../services/clipboard.service';
import type { DecryptedVaultItem, LocalVaultItem } from '../../../services/offline-vault.service';
import { spacing } from '../../../theme/theme';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { categoryDetails } from '../../../theme/categories';
import { ScreenHeading, IconBadge, Notice, StatusPill, LoadingState, EmptyState, SectionHeading } from '../../../components/ui/Presentation';
import { contactsApiService, canApproveAccess } from '../../../services/contacts-api.service';
import { getErrorMessage } from '../../../services/error-messages';
import { syncService } from '../../../services/sync.service';
import { requestLocationService } from '../../../services/request-location.service';
import { AccessibleSwitch } from '../../../components/ui/AccessibleSwitch';
import { ActivityConfirmationRequired, vaultActivityService } from '../../../services/vault-activity.service';
import { SensitiveActivityConfirmation } from '../../../components/SensitiveActivityConfirmation';

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
type SensitiveAction = 'reveal' | 'copy-login' | 'copy-password' | 'delete';

export default function VaultItemDetailScreen() {
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [item, setItem] = useState<LocalVaultItem | null>(null);
  const [revealed, setRevealed] = useState<DecryptedVaultItem | null>(null);
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const [gate, setGate] = useState<GateState>('loading');
  const [sensitiveAction, setSensitiveAction] = useState<SensitiveAction | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [emergencyPassword, setEmergencyPassword] = useState('');
  const [notes, setNotes] = useState<string | null>(null);
  const [approverAvailable, setApproverAvailable] = useState<boolean | null>(null);
  const [requestError, setRequestError] = useState('');
  const [locationNotice, setLocationNotice] = useState('');
  const [retainLocation, setRetainLocation] = useState(false);
  const biometrics = useAuthStore((state) => state.biometrics);
  const deviceLock = useAuthStore((state) => state.deviceLock);
  const [online, setOnline] = useState(connectivityService.isOnline);
  useEffect(() => connectivityService.subscribe(setOnline), []);
  const alive = useRef(false);
  const focusGeneration = useRef(0);
  const accessLogIdRef = useRef<string | null>(null);
  const requestInFlight = useRef<number | null>(null);
  const emergencyAccessId = useRef<string | null>(null);

  async function requireIdentity(action: SensitiveAction) {
    setSensitiveAction(action); setRevealed(null); setEmergencyPassword('');
    try { await sensitiveClipboard.clear(); }
    catch (error) { setRequestError(getErrorMessage(error, 'Não foi possível limpar a cópia anterior. Use Limpar ou feche o aplicativo.')); }
  }

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
      const contacts = await contactsApiService.findAll();
      if (!current()) return;
      setApproverAvailable(contacts.some(canApproveAccess));
      const history = await accessApiService.history();
      if (!current()) return;
      const pending = history.find((entry) => entry.vaultItem.id === found.id &&
        ['PENDING', 'APPROVED'].includes(entry.status) && new Date(entry.expiresAt).getTime() > apiClient.getServerTime());
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
    setRevealed(null); setSensitiveAction(null); setUsedFallback(false); setExpiresAt(null); setNotes(null); setApproverAvailable(null); setRequestError(''); setLocationNotice(''); setRetainLocation(false);
    accessLogIdRef.current = null;
    emergencyAccessId.current = null;
    void loadItem().catch((error) => {
      if (alive.current && focusGeneration.current === generation) {
        if (error instanceof ActivityConfirmationRequired) { void requireIdentity('reveal'); return; }
        setGate('locked');
        setRequestError(getErrorMessage(error, 'Não foi possível conferir o acesso. Verifique a conexão e tente novamente.'));
      }
    });
    return () => {
      alive.current = false; ++focusGeneration.current; setRevealed(null); setEmergencyPassword('');
      if (!useAuthStore.getState().isLocked) void sensitiveClipboard.clear().catch(() => undefined);
    };
  }, [loadItem]));

  useEffect(() => {
    if (!expiresAt || !['waiting', 'revealed'].includes(gate) || usedFallback) return;
    const timeout = setTimeout(() => { setRevealed(null); setGate('expired'); void sensitiveClipboard.clear().catch(() => undefined); }, Math.max(0, expiresAt.getTime() - apiClient.getServerTime()));
    return () => clearTimeout(timeout);
  }, [expiresAt, gate, usedFallback]);

  useEffect(() => {
    if (gate !== 'waiting' || sensitiveAction) return;
    async function reconcile() {
      const generation = focusGeneration.current;
      const requestId = accessLogIdRef.current;
      if (!requestId || !connectivityService.isOnline) return;
      try {
        const state = await accessApiService.state(requestId);
        if (!alive.current || focusGeneration.current !== generation) return;
        setNotes(state.notes); setRequestError('');
        if (state.status === 'APPROVED') {
          const value = await vaultService.revealItem(id, requestId);
          if (alive.current && focusGeneration.current === generation) { setRevealed(value); setGate('revealed'); }
        } else if (state.status === 'DENIED' || state.status === 'EXPIRED' || state.status === 'CANCELLED') {
          setRevealed(null); setGate(state.status === 'CANCELLED' ? 'cancelled' : state.status === 'DENIED' ? 'denied' : 'expired');
          void sensitiveClipboard.clear().catch(() => undefined);
        }
      } catch (error) {
        if (alive.current && focusGeneration.current === generation) {
          if (error instanceof ActivityConfirmationRequired) { void requireIdentity('reveal'); return; }
          setRequestError(getErrorMessage(error, 'Não foi possível atualizar a resposta. Vamos tentar novamente.'));
        }
      }
    }
    void reconcile();
    const interval = setInterval(() => void reconcile(), 3_000);
    return () => clearInterval(interval);
  }, [gate, id, sensitiveAction]);

  // Listen for real-time resolution while a request is pending.
  useEffect(() => {
    const unsubscribe = accessSocketService.onAccessResolved((event) => {
      if (!alive.current || event.accessLogId !== accessLogIdRef.current) return;
      const generation = focusGeneration.current;
      setNotes(event.notes);

      if (event.status === 'APPROVED' && id) {
        void vaultService.revealItem(id, event.accessLogId).then((value) => { if (alive.current && focusGeneration.current === generation) { setRevealed(value); setGate('revealed'); } })
          .catch((error) => {
            if (alive.current && focusGeneration.current === generation) {
              if (error instanceof ActivityConfirmationRequired) { void requireIdentity('reveal'); return; }
              setRevealed(null); setRequestError(getErrorMessage(error)); setGate('locked');
            }
          });
      }
      else if (event.status === 'DENIED' || event.status === 'EXPIRED') {
        setRevealed(null); setGate(event.status === 'DENIED' ? 'denied' : 'expired');
        void sensitiveClipboard.clear().catch(() => undefined);
      }
    });
    return unsubscribe;
  }, [id]);

  async function handleRequestAccess() {
    if (!item || requestInFlight.current === focusGeneration.current) return;
    const generation = focusGeneration.current;
    const owner = useAuthStore.getState().user?.id;
    const current = () => alive.current && generation === focusGeneration.current &&
      useAuthStore.getState().user?.id === owner && !useAuthStore.getState().isLocked;
    if (!connectivityService.isOnline) { setGate('offline-fallback'); return; }
    requestInFlight.current = generation;
    setGate('requesting');
    setRequestError('');
    setLocationNotice('');

    try {
      await contactsApiService.requireApprovingContact();
      if (!item.synced) await syncService.sync();
      if (!current()) return;
      const currentItem = await vaultService.getItem(item.id);
      if (!currentItem?.synced) throw new Error('Senha ainda nao sincronizada.');
      const capture = await requestLocationService.captureOnce(current);
      if (!current()) return;
      if (!connectivityService.isOnline) { setGate('offline-fallback'); return; }
      const result = await accessApiService.requestAccess(currentItem.id, undefined, capture.available ? capture.location : undefined, retainLocation);
      if (!current()) return;
      accessLogIdRef.current = result.accessLogId;
      setExpiresAt(new Date(result.expiresAt));
      setLocationNotice(result.locationShared
        ? `Este pedido inclui uma posição pontual, sem atualizações. ${result.locationHistoryExpiresAt
          ? `Se autorizado ou negado, ela poderá ser consultada no histórico até ${new Date(result.locationHistoryExpiresAt).toLocaleDateString('pt-BR')}.`
          : 'Ela será apagada quando o pedido for encerrado.'}`
        : `Pedido enviado sem localização. ${capture.available ? 'O familiar verá um aviso.' : capture.message}`);
      setGate('waiting');
    } catch (err) {
      if (!current()) return;
      if (!connectivityService.isOnline) {
        setGate('offline-fallback');
      } else {
        setRequestError(getErrorMessage(err));
        setGate('locked');
      }
    } finally { if (requestInFlight.current === generation) requestInFlight.current = null; }
  }

  function handleEmergencyReveal(method: UnlockMethod | 'password') {
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
                () => useAuthStore.getState().reauthenticate(method === 'password' ? password : undefined,
                  method === 'device' ? 'device' : 'biometric'));
              if (!alive.current || generation !== focusGeneration.current) return;
              setRevealed(value);
              emergencyAccessId.current = value.emergencyAccessId;
              setUsedFallback(true);
              setGate('revealed');
            } catch (error) {
              Alert.alert('Emergência não liberada', getErrorMessage(error));
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
    } catch (error) { Alert.alert('Cancelamento não concluído', getErrorMessage(error, 'O pedido pode ter sido respondido. Confira o estado antes de tentar novamente.')); }
  }

  async function handleDelete() {
    if (!item) return;
    const owner = useAuthStore.getState().user?.id;
    const generation = focusGeneration.current;
    Alert.alert('Excluir senha', `Tem certeza que deseja excluir "${item.label}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          if (!alive.current || generation !== focusGeneration.current || useAuthStore.getState().user?.id !== owner || useAuthStore.getState().isLocked) return;
          try { await vaultService.deleteItem(item.id); router.back(); }
          catch (error) {
            if (error instanceof ActivityConfirmationRequired) { await requireIdentity('delete'); return; }
            Alert.alert('Não foi possível excluir', getErrorMessage(error, 'A senha continua no cofre. Tente novamente.'));
          }
        },
      },
    ]);
  }

  function handleCopy(field: 'login' | 'password') {
    const generation = focusGeneration.current;
    const owner = useAuthStore.getState().user?.id;
    const label = field === 'login' ? 'Login' : 'Senha';
    Alert.alert(`Copiar ${label.toLocaleLowerCase('pt-BR')}`, 'A cópia ficará disponível para colar em outro aplicativo por até 5 minutos.', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Copiar', onPress: async () => {
        const value = revealedRef.current?.plaintext[field];
        if (!alive.current || generation !== focusGeneration.current || !value || useAuthStore.getState().isLocked ||
            (expiresAt && !usedFallback && expiresAt.getTime() <= apiClient.getServerTime())) return;
        try {
          if (!item) return;
          await vaultActivityService.authorize('COPY', item.id);
          if (!alive.current || generation !== focusGeneration.current || useAuthStore.getState().isLocked || useAuthStore.getState().user?.id !== owner) return;
          await sensitiveClipboard.copy(value); Alert.alert(`${label} ${field === 'login' ? 'copiado' : 'copiada'}.`);
        } catch (error) {
          if (error instanceof ActivityConfirmationRequired) { await requireIdentity(field === 'login' ? 'copy-login' : 'copy-password'); return; }
          Alert.alert('Não foi possível copiar', getErrorMessage(error, 'O conteúdo não foi copiado. Tente novamente.'));
        }
      } },
    ]);
  }

  async function continueSensitiveAction() {
    const action = sensitiveAction;
    const generation = focusGeneration.current;
    const owner = useAuthStore.getState().user?.id;
    const current = () => alive.current && generation === focusGeneration.current && useAuthStore.getState().user?.id === owner && !useAuthStore.getState().isLocked;
    if (!alive.current || !action) return;
    if (action === 'delete') {
      setSensitiveAction(null); await loadItem();
      if (alive.current && generation === focusGeneration.current) await handleDelete();
      return;
    }
    const value = usedFallback ? await vaultService.revealEmergencyAfterConfirmation(id, emergencyAccessId.current ?? '')
      : await vaultService.revealItem(id, accessLogIdRef.current ?? undefined);
    if (!current()) return;
    setRevealed(value); setGate('revealed'); setSensitiveAction(null);
    if (action === 'copy-login' || action === 'copy-password') {
      const field = action === 'copy-login' ? 'login' : 'password';
      const text = value.plaintext[field];
      if (text) {
        await vaultActivityService.authorize('COPY', value.id);
        if (!current()) return;
        await sensitiveClipboard.copy(text);
        if (current()) Alert.alert(field === 'login' ? 'Login copiado.' : 'Senha copiada.');
      }
    }
  }

  if (sensitiveAction) return <Screen>
    <ScreenHeading title="Um cuidado com seu cofre" onBack={() => router.back()} />
    <SensitiveActivityConfirmation onConfirmed={continueSensitiveAction} onCancel={() => router.back()} />
  </Screen>;

  if (gate === 'loading') {
    return (
      <Screen>
        <ScreenHeading title="Abrir senha" onBack={() => router.back()} />
        <LoadingState label="Preparando o item do cofre..." />
      </Screen>
    );
  }

  if (gate === 'not-found' || !item) {
    return (
      <Screen>
        <ScreenHeading title="Abrir senha" onBack={() => router.back()} />
        <EmptyState title="Não foi possível abrir esta senha" description="Volte ao cofre e atualize a lista para tentar novamente." icon="key-outline" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeading title={item.label} eyebrow={categoryDetails(item.category).label} onBack={() => router.back()} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
        <StatusPill label={item.requiresApproval ? 'Acesso assistido' : 'Seu cofre pessoal'} icon={item.requiresApproval ? 'people-outline' : 'key-outline'} />
        {item.isFavorite && <StatusPill label="Favorita" icon="star" tone="warning" />}
      </View>
      {Boolean(requestError) && <Notice tone="danger">{requestError}</Notice>}

      {gate === 'locked' && (
        <AccessibleCard highlight>
          <IconBadge icon="people-outline" tone="accent" large />
          <View style={{ marginTop: spacing.lg }}><SectionHeading title="Um cuidado a mais"
            description="Seu familiar precisa autorizar a abertura. Ele não recebe o conteúdo desta senha." /></View>
          <Notice tone="primary">O pedido vale por dez minutos desde o envio. Você pode cancelar enquanto aguarda.</Notice>
          <AccessibleText>Só ao enviar, tentaremos compartilhar uma posição com seu familiar. Não acompanhamos seu trajeto. Sem localização disponível, o pedido seguirá com um aviso. Se ele escolher ver o mapa, poderá enviar esse ponto ao OpenStreetMap.</AccessibleText>
          <View style={{ marginVertical: spacing.md }}>
            <AccessibleSwitch label="Guardar este ponto no histórico por 30 dias" value={retainLocation} onValueChange={setRetainLocation}
              description="Opcional e só para este pedido. Se autorizado ou negado, o ponto ficará visível a você e aos familiares que continuem autorizados. Cancelar ou expirar apaga a posição." />
          </View>
          {approverAvailable === false ? <>
            <Notice tone="warning" title="Nenhum familiar pode aprovar agora">A proteção desta senha foi mantida. Convide um familiar, aguarde o aceite e ative “Pode aprovar acessos”.</Notice>
            <AccessibleButton label="Ir para Meus familiares" icon="people-outline" onPress={() => router.push('/(elderly)/contacts')} />
            <AccessibleButton label="Conferir acesso novamente" variant="quiet" onPress={() => {
              setRequestError(''); void loadItem().catch((error) => setRequestError(getErrorMessage(error)));
            }} />
            {!online && <AccessibleButton label="Usar emergência offline" variant="quiet" onPress={handleRequestAccess} />}
          </> : <AccessibleButton label="Solicitar acesso ao familiar" onPress={handleRequestAccess} />}
        </AccessibleCard>
      )}

      {gate === 'requesting' && (
        <LoadingState label="Enviando seu pedido..." />
      )}

      {gate === 'waiting' && (
        <AccessibleCard>
          <IconBadge icon="hourglass-outline" tone="warning" large />
          <View style={{ marginTop: spacing.lg }}><SectionHeading title="Pedido enviado"
            description="Aguardando resposta do familiar. A tela será atualizada quando houver uma decisão." /></View>
          {expiresAt && (
            <StatusPill icon="time-outline" tone="warning" label={`Válido até ${expiresAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`} />
          )}
          {Boolean(locationNotice) && <Notice title="Sobre sua localização" tone="neutral">{locationNotice}</Notice>}
          <View style={{ marginTop: spacing.md }}><AccessibleButton label="Cancelar pedido" icon="close-outline" variant="secondary" onPress={() => void cancelRequest()} /></View>
        </AccessibleCard>
      )}

      {gate === 'denied' && (
        <AccessibleCard>
          <Notice tone="danger" title="Acesso não autorizado" icon="close-circle-outline">Seu familiar negou este pedido. Se precisar, converse com ele antes de tentar novamente.</Notice>
          {Boolean(notes) && <AccessibleText variant="body">{notes}</AccessibleText>}
          <View style={{ marginTop: spacing.md }}>
            <AccessibleButton label="Tentar novamente" onPress={() => setGate('locked')} />
          </View>
        </AccessibleCard>
      )}

      {(gate === 'expired' || gate === 'cancelled') && (
        <AccessibleCard>
          <Notice tone="warning" title={gate === 'cancelled' ? 'Pedido cancelado' : 'O prazo terminou'} icon="time-outline">
            A senha não foi liberada por este pedido. Você pode enviar uma nova solicitação quando precisar.
          </Notice>
          <View style={{ marginTop: spacing.md }}>
            <AccessibleButton label="Solicitar novamente" onPress={() => setGate('locked')} />
          </View>
        </AccessibleCard>
      )}

      {gate === 'offline-fallback' && (
        <AccessibleCard highlight>
          <Notice tone="warning" title="Sem conexão com a internet" icon="cloud-offline-outline">
            Se não puder esperar, confirme sua identidade para usar a emergência. O acesso será registrado e enviado quando a conexão voltar.
          </Notice>
          <View style={{ gap: spacing.md }}>
            {deviceLock?.enabled && deviceLock.available && <AccessibleButton label="Emergência com bloqueio do celular" icon="phone-portrait-outline" variant="danger" onPress={() => handleEmergencyReveal('device')} />}
            {biometrics?.enabled && biometrics.available && <AccessibleButton label={`Emergência com ${biometrics.label}`} icon="finger-print-outline" variant="secondary" onPress={() => handleEmergencyReveal('biometric')} />}
            <AccessibleTextInput label="Senha mestra" value={emergencyPassword} onChangeText={setEmergencyPassword} secureTextEntry />
            <AccessibleButton label="Emergência com senha mestra" icon="key-outline" variant="danger" disabled={!emergencyPassword} onPress={() => handleEmergencyReveal('password')} />
          </View>
        </AccessibleCard>
      )}

      {gate === 'revealed' && revealed && (
        <>
          {usedFallback ? <Notice tone="warning" title="Acesso de emergência" icon="cloud-offline-outline">Revelado offline. O registro aguarda envio ao servidor.</Notice>
            : item.requiresApproval && <Notice tone="success" title="Acesso autorizado" icon="checkmark-circle-outline">Você pode consultar esta senha até o fim do prazo do pedido.</Notice>}
          <AccessibleCard>
            {revealed.plaintext.login && (
              <Field label="Login" value={revealed.plaintext.login} />
            )}
            <Field label="Senha" value={revealed.plaintext.password} />
            {revealed.plaintext.url && <Field label="Site" value={revealed.plaintext.url} />}
            {revealed.plaintext.notes && <Field label="Observações" value={revealed.plaintext.notes} />}
          </AccessibleCard>
          <View style={{ gap: spacing.md }}>
          {Boolean(revealed.plaintext.login) && <AccessibleButton label="Copiar login / usuário" icon="person-outline" variant="secondary" onPress={() => handleCopy('login')} />}
          <AccessibleButton label="Copiar senha" icon="copy-outline" onPress={() => handleCopy('password')} />
          <AccessibleText variant="caption" style={{ textAlign: 'center' }}>A cópia fica disponível por até cinco minutos.</AccessibleText>
          <AccessibleButton label="Editar senha" icon="create-outline" variant="secondary"
            onPress={() => router.push({ pathname: '/(elderly)/vault/edit', params: { id: item.id, accessLogId: accessLogIdRef.current ?? '' } })} />
          <AccessibleButton label={item.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} icon={item.isFavorite ? 'star' : 'star-outline'} variant="secondary"
            onPress={async () => {
              try { await vaultService.setFavorite(item.id, !item.isFavorite); setItem({ ...item, isFavorite: !item.isFavorite }); }
              catch (error) { Alert.alert('Não foi possível alterar o favorito', getErrorMessage(error)); }
            }} />
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xl }} />
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
