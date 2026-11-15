import { useCallback, useRef, useState } from 'react';
import { View, FlatList, Alert, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { AccessibleTextInput } from '../../../components/ui/AccessibleTextInput';
import { contactsApiService, type TrustedContact } from '../../../services/contacts-api.service';
import { spacing } from '../../../theme/theme';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { AccessibleSwitch } from '../../../components/ui/AccessibleSwitch';
import { ScreenHeading, SectionHeading, Notice, StatusPill, IconBadge, EmptyState, LoadingState } from '../../../components/ui/Presentation';
import { accountLogin, loginIdentifierError, normalizeLoginIdentifier } from '../../../services/input-validation';
import { getErrorMessage } from '../../../services/error-messages';
import { isKeyboardScrollResponder } from '../../../components/ui/KeyboardFocusContext';

const STATUS_LABELS: Record<TrustedContact['status'], string> = {
  PENDING: 'Convite pendente',
  ACTIVE: 'Ativo',
  REVOKED: 'Revogado',
};

export default function ContactsScreen() {
  const colors = useThemeColors();
  const list = useRef<FlatList<TrustedContact>>(null);
  const getKeyboardScrollResponder = useCallback(() => {
    const responder = list.current?.getScrollResponder();
    return isKeyboardScrollResponder(responder) ? responder : null;
  }, []);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadContacts = useCallback(async () => {
    try {
      const list = await contactsApiService.findAll();
      setContacts(list);
      setError(null);
    } catch (error) {
      setError(getErrorMessage(error, 'Não foi possível atualizar os familiares. Verifique a conexão.'));
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadContacts();
    }, [loadContacts]),
  );

  async function handleInvite() {
    if (!email.trim()) {
      Alert.alert('Informe o e-mail ou celular de entrada do familiar.');
      return;
    }
    const invalidEmail = loginIdentifierError(email);
    if (invalidEmail) { Alert.alert('Confira o login do familiar', invalidEmail); return; }

    setInviting(true);
    try {
      await contactsApiService.invite(normalizeLoginIdentifier(email)!);
      setEmail('');
      await loadContacts();
      Alert.alert('Convite enviado', 'Apos o aceite, ative a permissao de aprovar acessos para este familiar.');
    } catch (err) {
      Alert.alert('Não foi possível convidar', getErrorMessage(err));
    } finally {
      setInviting(false);
    }
  }

  function handleRevoke(contact: TrustedContact) {
    Alert.alert('Remover familiar', `Remover o acesso de ${contact.caregiver.name}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try { await contactsApiService.revoke(contact.id); await loadContacts(); }
          catch (error) { Alert.alert('Não foi possível remover', getErrorMessage(error)); }
        },
      },
    ]);
  }

  async function toggleApproval(contact: TrustedContact, allowed: boolean) {
    try {
      await contactsApiService.updatePermissions(contact.id, allowed ? ['VIEW_ITEMS', 'APPROVE_ACCESS'] : ['VIEW_ITEMS']);
      await loadContacts();
    } catch (error) { Alert.alert('Permissão não alterada', getErrorMessage(error)); }
  }

  return (
    <Screen scroll={false} getKeyboardScrollResponder={getKeyboardScrollResponder}>
      <FlatList
        ref={list}
        data={contacts}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={loading} colors={[colors.primary]} tintColor={colors.primary}
          onRefresh={() => { setLoading(true); void loadContacts(); }} />}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListHeaderComponent={<>
          <ScreenHeading title="Meus familiares" eyebrow="PERTO DE QUEM IMPORTA" icon="people-outline"
            description="Um apoio de confiança, sem compartilhar suas senhas." />
          <AccessibleCard>
            <SectionHeading title="Convide alguém de confiança" description="O familiar precisa ter uma conta no Senha Fácil." />
            <AccessibleTextInput label="E-mail ou celular de entrada do familiar" value={email} onChangeText={setEmail}
              autoCapitalize="none" autoCorrect={false} keyboardType="default" maxLength={254} editable={!inviting}
              hint="Use o login escolhido pelo familiar ao criar a conta, não o telefone opcional de contato." />
            <AccessibleButton label="Convidar familiar" icon="person-add-outline" onPress={handleInvite} loading={inviting} />
          </AccessibleCard>
          <Notice tone="accent" icon="checkmark-done-outline" title="Você decide a permissão">
            Primeiro o familiar aceita o convite. Depois, você ativa “Pode aprovar acessos” no cartão dele.
          </Notice>
          {error && <Notice tone="danger" title="Não foi possível atualizar">{error}</Notice>}
          <SectionHeading title="Sua rede de confiança" />
        </>}
        ListEmptyComponent={loading ? <LoadingState label="Buscando seus familiares..." /> : error ?
          <AccessibleButton label="Tentar novamente" variant="secondary" onPress={() => void loadContacts()} /> :
          <EmptyState title="O primeiro convite começa aqui" description="Escolha alguém em quem você confia e use o campo acima para convidar." icon="people-outline" />}
        renderItem={({ item }) => (
          <AccessibleCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
              <IconBadge icon="person-outline" tone={item.status === 'ACTIVE' ? 'primary' : 'neutral'} />
              <View style={{ flex: 1 }}>
                <AccessibleText variant="bodyLarge" bold>{item.caregiver.name}</AccessibleText>
                <AccessibleText variant="caption">{accountLogin(item.caregiver)}</AccessibleText>
              </View>
            </View>
            <StatusPill label={STATUS_LABELS[item.status]} tone={item.status === 'ACTIVE' ? 'success' : item.status === 'PENDING' ? 'warning' : 'neutral'}
              icon={item.status === 'ACTIVE' ? 'checkmark-circle-outline' : item.status === 'PENDING' ? 'time-outline' : 'remove-circle-outline'} />
            {item.status === 'ACTIVE' && (
              <View style={{ marginTop: spacing.md }}>
                <AccessibleSwitch label={`Pode aprovar acessos: ${item.caregiver.name}`} value={item.permissions.includes('APPROVE_ACCESS')}
                  description="Também recebe avisos de segurança da sua conta. Você pode retirar esta permissão quando quiser."
                  onValueChange={(allowed) => void toggleApproval(item, allowed)} />
              </View>
            )}
            {item.status !== 'REVOKED' && (
              <View style={{ marginTop: spacing.sm }}>
                <AccessibleButton label="Remover familiar" icon="person-remove-outline" variant="quiet" onPress={() => handleRevoke(item)} />
              </View>
            )}
          </AccessibleCard>
        )}
      />
    </Screen>
  );
}
