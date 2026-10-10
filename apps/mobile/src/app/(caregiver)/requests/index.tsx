import { useCallback, useState } from 'react';
import { View, FlatList, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { AccessibleTextInput } from '../../../components/ui/AccessibleTextInput';
import { accessApiService, type PendingAccessRequest } from '../../../services/access-api.service';
import { contactsApiService, type TrustedContact } from '../../../services/contacts-api.service';
import { useAuthStore } from '../../../stores/auth.store';
import { colors, spacing } from '../../../theme/theme';

const CATEGORY_LABELS: Record<string, string> = {
  BANKING: 'Banco',
  SOCIAL_MEDIA: 'Rede Social',
  EMAIL: 'E-mail',
  HEALTH: 'Saúde',
  GOVERNMENT: 'Governo',
  SHOPPING: 'Compras',
  OTHER: 'Outro',
};

export default function CaregiverRequestsScreen() {
  const router = useRouter();
  const [pendingAccess, setPendingAccess] = useState<PendingAccessRequest[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TrustedContact[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [activeContacts, setActiveContacts] = useState<TrustedContact[]>([]);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const logout = useAuthStore((s) => s.logout);

  const loadAll = useCallback(async () => {
    try {
      const [access, contacts] = await Promise.all([accessApiService.findPending(), contactsApiService.findAll()]);
      setPendingAccess(access);
      setPendingInvites(contacts.filter((contact) => contact.status === 'PENDING'));
      setActiveContacts(contacts.filter((contact) => contact.status === 'ACTIVE'));
      setError('');
    } catch { setError('Nao foi possivel atualizar. Verifique a conexao.'); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
      const poll = setInterval(() => void loadAll(), 5_000);
      return () => clearInterval(poll);
    }, [loadAll]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function handleAcceptInvite(contact: TrustedContact) {
    try { await contactsApiService.accept(contact.id); await loadAll(); }
    catch { Alert.alert('Convite nao aceito', 'Verifique a conexao e tente novamente.'); }
  }

  function handleLeave(contact: TrustedContact) {
    Alert.alert('Encerrar vinculo', `Encerrar o vinculo com ${contact.elderly.name}?`, [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Encerrar', style: 'destructive', onPress: async () => {
        try { await contactsApiService.revoke(contact.id); await loadAll(); }
        catch { Alert.alert('Nao foi possivel encerrar o vinculo.'); }
      } },
    ]);
  }

  async function handleRespond(request: PendingAccessRequest, decision: 'APPROVED' | 'DENIED') {
    setRespondingId(request.id);
    try {
      await accessApiService.respond(request.id, decision, notes[request.id]?.trim() || undefined);
      await loadAll();
    } catch (err) {
      Alert.alert('Não foi possível responder', err instanceof Error ? err.message : String(err));
    } finally {
      setRespondingId(null);
    }
  }

  const hasNothingPending = pendingAccess.length === 0 && pendingInvites.length === 0;

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: spacing.md }}>
        <AccessibleText variant="title">Solicitações</AccessibleText>
        <View style={{ gap: spacing.sm, marginVertical: spacing.md }}>
          <AccessibleButton label="Historico de acessos" icon="time-outline" variant="secondary" onPress={() => router.push('/(caregiver)/history')} />
          <AccessibleButton label="Minha conta" icon="person-circle-outline" variant="secondary" onPress={() => router.push('/(caregiver)/profile')} />
        </View>
        {Boolean(error) && <AccessibleText variant="body" color={colors.danger} accessibilityLiveRegion="polite">{error}</AccessibleText>}
      </View>

      <FlatList
        data={[] as never[]}
        renderItem={null}
        keyExtractor={() => 'unused'}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <View>
            {pendingInvites.map((contact) => (
              <AccessibleCard key={contact.id} highlight>
                <AccessibleText variant="bodyLarge" bold>
                  Convite de {contact.elderly.name}
                </AccessibleText>
                <AccessibleText variant="caption">{contact.elderly.email}</AccessibleText>
                <View style={{ marginTop: spacing.sm }}>
                  <AccessibleButton label="Aceitar convite" onPress={() => handleAcceptInvite(contact)} />
                  <AccessibleButton label="Recusar convite" variant="secondary" onPress={() => handleLeave(contact)} />
                </View>
              </AccessibleCard>
            ))}

            {pendingAccess.map((request) => (
              <AccessibleCard key={request.id} highlight>
                <AccessibleText variant="bodyLarge" bold>
                  {request.requester.name} pede acesso a "{request.vaultItem.label}"
                </AccessibleText>
                <AccessibleTextInput label="Motivo (opcional)" value={notes[request.id] ?? ''} maxLength={500}
                  onChangeText={(value) => setNotes((current) => ({ ...current, [request.id]: value }))} />
                <AccessibleText variant="caption">
                  {CATEGORY_LABELS[request.vaultItem.category] ?? request.vaultItem.category}
                </AccessibleText>
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <AccessibleButton
                      label="Autorizar"
                      icon="checkmark-outline"
                      onPress={() => handleRespond(request, 'APPROVED')}
                      loading={respondingId === request.id}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AccessibleButton
                      label="Negar"
                      icon="close-outline"
                      variant="danger"
                      onPress={() => handleRespond(request, 'DENIED')}
                      loading={respondingId === request.id}
                    />
                  </View>
                </View>
              </AccessibleCard>
            ))}

            {hasNothingPending && (
              <AccessibleText variant="body" color={colors.textSecondary}>
                Nenhuma solicitação pendente no momento.
              </AccessibleText>
            )}

            {activeContacts.map((contact) => (
              <AccessibleCard key={contact.id}>
                <AccessibleText variant="bodyLarge" bold>{contact.elderly.name}</AccessibleText>
                <AccessibleText variant="body">{contact.permissions.includes('APPROVE_ACCESS') ? 'Pode aprovar acessos' : 'Sem permissao para aprovar'}</AccessibleText>
                <AccessibleButton label="Encerrar vinculo" variant="secondary" onPress={() => handleLeave(contact)} />
              </AccessibleCard>
            ))}

            <AccessibleButton label="Sair da conta" icon="log-out-outline" variant="secondary" onPress={() => void logout()} />
          </View>
        }
      />
    </Screen>
  );
}
