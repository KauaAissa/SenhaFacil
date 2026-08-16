import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { vaultService } from '../../../services/vault.service';
import { accessApiService } from '../../../services/access-api.service';
import { accessSocketService } from '../../../services/access-socket.service';
import { connectivityService } from '../../../services/connectivity.service';
import type { DecryptedVaultItem } from '../../../services/offline-vault.service';
import { colors, spacing } from '../../../theme/theme';

type GateState =
  | 'loading'
  | 'locked'
  | 'requesting'
  | 'waiting'
  | 'denied'
  | 'expired'
  | 'offline-fallback'
  | 'revealed'
  | 'not-found';

export default function VaultItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [item, setItem] = useState<DecryptedVaultItem | null>(null);
  const [gate, setGate] = useState<GateState>('loading');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const accessLogIdRef = useRef<string | null>(null);

  const loadItem = useCallback(async () => {
    const items = await vaultService.getAllItems();
    const found = items.find((i) => i.id === id) ?? null;
    setItem(found);
    setGate(!found ? 'not-found' : found.requiresApproval ? 'locked' : 'revealed');
  }, [id]);

  useEffect(() => {
    void loadItem();
  }, [loadItem]);

  // Listen for real-time resolution while a request is pending.
  useEffect(() => {
    const unsubscribe = accessSocketService.onAccessResolved((event) => {
      if (event.accessLogId !== accessLogIdRef.current) return;

      if (event.status === 'APPROVED') setGate('revealed');
      else if (event.status === 'DENIED') setGate('denied');
      else if (event.status === 'EXPIRED') setGate('expired');
    });
    return unsubscribe;
  }, []);

  async function handleRequestAccess() {
    if (!item) return;
    setGate('requesting');

    try {
      const result = await accessApiService.requestAccess(item.id);
      accessLogIdRef.current = result.accessLogId;
      setExpiresAt(new Date(result.expiresAt));
      setGate('waiting');
    } catch (err) {
      if (!connectivityService.isOnline) {
        setGate('offline-fallback');
      } else {
        Alert.alert('Não foi possível solicitar acesso', err instanceof Error ? err.message : String(err));
        setGate('locked');
      }
    }
  }

  function handleEmergencyReveal() {
    Alert.alert(
      'Modo de emergência',
      'Você está sem conexão. Deseja revelar esta senha mesmo assim? Isso ficará registrado para seu familiar quando a conexão voltar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revelar mesmo assim',
          style: 'destructive',
          onPress: () => {
            setUsedFallback(true);
            setGate('revealed');
          },
        },
      ],
    );
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
            🔒 Esta senha requer aprovação
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
            ⏳ Aguardando resposta do familiar...
          </AccessibleText>
          {expiresAt && (
            <AccessibleText variant="caption" style={{ marginTop: spacing.xs }}>
              Expira às {expiresAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </AccessibleText>
          )}
        </AccessibleCard>
      )}

      {gate === 'denied' && (
        <AccessibleCard>
          <AccessibleText variant="body" bold color={colors.danger}>
            O familiar negou este acesso.
          </AccessibleText>
          <View style={{ marginTop: spacing.md }}>
            <AccessibleButton label="Tentar novamente" onPress={() => setGate('locked')} />
          </View>
        </AccessibleCard>
      )}

      {gate === 'expired' && (
        <AccessibleCard>
          <AccessibleText variant="body" bold color={colors.warning}>
            A solicitação expirou sem resposta.
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
          <AccessibleButton label="Acesso de emergência" variant="danger" onPress={handleEmergencyReveal} />
        </AccessibleCard>
      )}

      {gate === 'revealed' && (
        <>
          {usedFallback && (
            <AccessibleCard highlight>
              <AccessibleText variant="caption" color={colors.warning} bold>
                ⚠ Revelado em modo de emergência (offline)
              </AccessibleText>
            </AccessibleCard>
          )}
          <AccessibleCard>
            {item.plaintext.login && (
              <Field label="Login" value={item.plaintext.login} />
            )}
            <Field label="Senha" value={item.plaintext.password} />
            {item.plaintext.url && <Field label="Site" value={item.plaintext.url} />}
            {item.plaintext.notes && <Field label="Observações" value={item.plaintext.notes} />}
          </AccessibleCard>
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
