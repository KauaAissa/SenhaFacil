import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, FlatList, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { accessApiService, type PendingAccessRequest } from '../../../services/access-api.service';
import { contactsApiService, type TrustedContact } from '../../../services/contacts-api.service';
import { spacing } from '../../../theme/theme';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { categoryDetails } from '../../../theme/categories';
import { ScreenHeading, SectionHeading, Notice, IconBadge, StatusPill, EmptyState, LoadingState } from '../../../components/ui/Presentation';
import { SupportTools } from '../../../components/SupportTools';
import { getErrorMessage } from '../../../services/error-messages';
import { apiClient } from '../../../services/api.client';
import { useAuthStore } from '../../../stores/auth.store';
import { RequestLocation } from '../../../components/RequestLocation';
import { accountLogin } from '../../../services/input-validation';

export default function CaregiverRequestsScreen() {
  const colors = useThemeColors();
  const [pendingAccess, setPendingAccess] = useState<PendingAccessRequest[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TrustedContact[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [activeContacts, setActiveContacts] = useState<TrustedContact[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const active = useRef(false);
  const loadGeneration = useRef(0);

  const loadAll = useCallback(async () => {
    if (!active.current || AppState.currentState !== 'active') return;
    const generation = ++loadGeneration.current;
    const owner = useAuthStore.getState().user?.id;
    const current = () => active.current && generation === loadGeneration.current &&
      AppState.currentState === 'active' && useAuthStore.getState().user?.id === owner && !useAuthStore.getState().isLocked;
    try {
      const [access, contacts] = await Promise.all([accessApiService.findPending(), contactsApiService.findAll()]);
      if (!current()) return;
      setPendingAccess(access.filter((request) => request.status === 'PENDING' && Date.parse(request.expiresAt) > apiClient.getServerTime()));
      setPendingInvites(contacts.filter((contact) => contact.status === 'PENDING'));
      setActiveContacts(contacts.filter((contact) => contact.status === 'ACTIVE'));
      setError('');
    } catch (error) {
      if (!current()) return;
      setPendingAccess((items) => items.map((request) => ({ ...request, location: null })));
      setError(getErrorMessage(error, 'Não foi possível atualizar. Verifique a conexão.'));
    } finally { if (current()) setLoading(false); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void loadAll();
      const poll = setInterval(() => void loadAll(), 5_000);
      const expiry = setInterval(() => setPendingAccess((items) => {
        const valid = items.filter((request) => Date.parse(request.expiresAt) > apiClient.getServerTime());
        return valid.length === items.length ? items : valid;
      }), 1_000);
      return () => {
        active.current = false; ++loadGeneration.current;
        clearInterval(poll); clearInterval(expiry); setPendingAccess([]);
      };
    }, [loadAll]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        ++loadGeneration.current;
        setPendingAccess((items) => items.map((request) => ({ ...request, location: null })));
      }
    });
    return () => subscription.remove();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function handleAcceptInvite(contact: TrustedContact) {
    try { await contactsApiService.accept(contact.id); await loadAll(); }
    catch (error) { Alert.alert('Convite não aceito', getErrorMessage(error)); }
  }

  function handleLeave(contact: TrustedContact) {
    Alert.alert('Encerrar vinculo', `Encerrar o vinculo com ${contact.elderly.name}?`, [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Encerrar', style: 'destructive', onPress: async () => {
        try { await contactsApiService.revoke(contact.id); await loadAll(); }
        catch (error) { Alert.alert('Não foi possível encerrar o vínculo', getErrorMessage(error)); }
      } },
    ]);
  }

  async function handleRespond(request: PendingAccessRequest, decision: 'APPROVED' | 'DENIED') {
    if (respondingId) return;
    setRespondingId(request.id);
    try {
      await accessApiService.respond(request.id, decision);
      setPendingAccess((items) => items.filter((item) => item.id !== request.id));
      await loadAll();
    } catch (err) {
      Alert.alert('Não foi possível responder', getErrorMessage(err));
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={pendingAccess}
        keyExtractor={(request) => request.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} colors={[colors.primary]} tintColor={colors.primary} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <View>
            <ScreenHeading title="Solicitações" eyebrow="CUIDAR É ESTAR POR PERTO" icon="people-outline"
              description="Ajude com uma decisão. As senhas continuam só com o titular." />
            {!loading && !error && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              <StatusPill label={`${pendingAccess.length} ${pendingAccess.length === 1 ? 'pedido' : 'pedidos'}`} tone="warning" icon="time-outline" />
              <StatusPill label={`${pendingInvites.length} ${pendingInvites.length === 1 ? 'convite' : 'convites'}`} tone="accent" icon="mail-outline" />
            </View>}
            {Boolean(error) && <Notice tone="danger" title="Atualização indisponível">{error}</Notice>}
            {(pendingAccess.length > 0 || pendingInvites.length === 0) &&
              <SectionHeading title="Pedidos de acesso" description="Você pode autorizar ou negar cada pedido." />}
          </View>
        }
        renderItem={({ item: request }) => (
              <AccessibleCard highlight>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
                  <IconBadge icon={categoryDetails(request.vaultItem.category).icon} tone={categoryDetails(request.vaultItem.category).tone} />
                  <View style={{ flex: 1 }}>
                    <AccessibleText variant="caption">{categoryDetails(request.vaultItem.category).label}</AccessibleText>
                    <StatusPill label="Aguardando você" tone="warning" icon="time-outline" />
                  </View>
                </View>
                <AccessibleText variant="bodyLarge" bold>
                  {request.requester.name} pede acesso a "{request.vaultItem.label}"
                </AccessibleText>
                <AccessibleText variant="caption" style={{ marginVertical: spacing.md }}>Válido até {new Date(request.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</AccessibleText>
                <RequestLocation location={request.location} />
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <AccessibleButton
                      label="Autorizar"
                      icon="checkmark-outline"
                      onPress={() => handleRespond(request, 'APPROVED')}
                      loading={respondingId === request.id}
                      disabled={respondingId !== null}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AccessibleButton
                      label="Negar"
                      icon="close-outline"
                      variant="danger"
                      onPress={() => handleRespond(request, 'DENIED')}
                      loading={respondingId === request.id}
                      disabled={respondingId !== null}
                    />
                  </View>
                </View>
              </AccessibleCard>
        )}
        ListEmptyComponent={loading ? <LoadingState label="Buscando pedidos..." /> : error ?
          <AccessibleButton label="Tentar novamente" variant="secondary" onPress={() => void loadAll()} /> : pendingInvites.length ? null :
          <EmptyState title="Nenhum pedido aguardando" description="Quando alguém precisar da sua ajuda, o pedido aparecerá aqui." icon="checkmark-done-outline" />}
        ListFooterComponent={<View>
            {pendingInvites.length > 0 && <SectionHeading title="Convites para ajudar" />}
            {pendingInvites.map((contact) => (
              <AccessibleCard key={contact.id} highlight>
                <View style={{ marginBottom: spacing.md }}><StatusPill label="Convite para ajudar" icon="mail-outline" tone="accent" /></View>
                <AccessibleText variant="bodyLarge" bold>Convite de {contact.elderly.name}</AccessibleText>
                <AccessibleText variant="caption">{accountLogin(contact.elderly)}</AccessibleText>
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  <AccessibleButton label="Aceitar convite" onPress={() => handleAcceptInvite(contact)} />
                  <AccessibleButton label="Recusar convite" variant="secondary" onPress={() => handleLeave(contact)} />
                </View>
              </AccessibleCard>
            ))}
            {activeContacts.length > 0 && <SectionHeading title="Pessoas que você acompanha" />}
            {activeContacts.map((contact) => (
              <AccessibleCard key={contact.id}>
                <View style={{ marginBottom: spacing.md }}><IconBadge icon="person-outline" /></View>
                <AccessibleText variant="bodyLarge" bold>{contact.elderly.name}</AccessibleText>
                <AccessibleText variant="body">{contact.permissions.includes('APPROVE_ACCESS') ? 'Pode aprovar acessos e receber avisos de segurança' : 'Sem permissão para aprovar ou receber avisos de segurança'}</AccessibleText>
                <AccessibleButton label="Encerrar vínculo" icon="person-remove-outline" variant="quiet" onPress={() => handleLeave(contact)} />
              </AccessibleCard>
            ))}
            <SupportTools />
          </View>}
      />
    </Screen>
  );
}
