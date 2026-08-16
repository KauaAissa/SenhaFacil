import { useCallback, useState } from 'react';
import { View, FlatList, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
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
  const [pendingAccess, setPendingAccess] = useState<PendingAccessRequest[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TrustedContact[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const logout = useAuthStore((s) => s.logout);

  const loadAll = useCallback(async () => {
    const [access, contacts] = await Promise.all([
      accessApiService.findPending().catch(() => []),
      contactsApiService.findAll().catch(() => []),
    ]);
    setPendingAccess(access);
    setPendingInvites(contacts.filter((c) => c.status === 'PENDING'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function handleAcceptInvite(contact: TrustedContact) {
    await contactsApiService.accept(contact.id);
    await loadAll();
  }

  async function handleRespond(request: PendingAccessRequest, decision: 'APPROVED' | 'DENIED') {
    setRespondingId(request.id);
    try {
      await accessApiService.respond(request.id, decision);
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
        <AccessibleText variant="body" color={colors.textSecondary} style={{ marginBottom: spacing.md }}>
          Acompanhe pedidos de acesso e convites de familiares.
        </AccessibleText>
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
                </View>
              </AccessibleCard>
            ))}

            {pendingAccess.map((request) => (
              <AccessibleCard key={request.id} highlight>
                <AccessibleText variant="bodyLarge" bold>
                  {request.requester.name} pede acesso a "{request.vaultItem.label}"
                </AccessibleText>
                <AccessibleText variant="caption">
                  {CATEGORY_LABELS[request.vaultItem.category] ?? request.vaultItem.category}
                </AccessibleText>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <AccessibleButton
                      label="Autorizar"
                      onPress={() => handleRespond(request, 'APPROVED')}
                      loading={respondingId === request.id}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AccessibleButton
                      label="Negar"
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

            <AccessibleButton label="Sair da conta" variant="secondary" onPress={() => void logout()} />
          </View>
        }
      />
    </Screen>
  );
}
