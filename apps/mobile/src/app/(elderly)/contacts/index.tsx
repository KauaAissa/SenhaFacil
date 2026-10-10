import { useCallback, useState } from 'react';
import { View, FlatList, Alert, Switch } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { AccessibleTextInput } from '../../../components/ui/AccessibleTextInput';
import { contactsApiService, type TrustedContact } from '../../../services/contacts-api.service';
import { useAuthStore } from '../../../stores/auth.store';
import { colors, spacing } from '../../../theme/theme';

const STATUS_LABELS: Record<TrustedContact['status'], string> = {
  PENDING: 'Convite pendente',
  ACTIVE: 'Ativo',
  REVOKED: 'Revogado',
};

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logout = useAuthStore((s) => s.logout);

  const loadContacts = useCallback(async () => {
    try {
      const list = await contactsApiService.findAll();
      setContacts(list);
      setError(null);
    } catch {
      setError('Nao foi possivel atualizar os familiares. Verifique a conexao.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadContacts();
    }, [loadContacts]),
  );

  async function handleInvite() {
    if (!email.trim()) {
      Alert.alert('Informe o e-mail do familiar.');
      return;
    }

    setInviting(true);
    try {
      await contactsApiService.invite(email.trim().toLowerCase());
      setEmail('');
      await loadContacts();
      Alert.alert('Convite enviado', 'Apos o aceite, ative a permissao de aprovar acessos para este familiar.');
    } catch (err) {
      Alert.alert('Não foi possível convidar', err instanceof Error ? err.message : String(err));
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
          catch { Alert.alert('Nao foi possivel remover', 'Verifique a conexao e tente novamente.'); }
        },
      },
    ]);
  }

  async function toggleApproval(contact: TrustedContact, allowed: boolean) {
    try {
      await contactsApiService.updatePermissions(contact.id, allowed ? ['VIEW_ITEMS', 'APPROVE_ACCESS'] : ['VIEW_ITEMS']);
      await loadContacts();
    } catch { Alert.alert('Permissao nao alterada', 'Verifique a conexao e tente novamente.'); }
  }

  return (
    <Screen scroll={false}>
      <View style={{ paddingTop: spacing.md }}>
        <AccessibleText variant="title">Meus Familiares</AccessibleText>
        <AccessibleText variant="body" color={colors.textSecondary} style={{ marginBottom: spacing.md }}>
          Convide um familiar de confiança para autorizar acessos sensíveis.
        </AccessibleText>

        <AccessibleTextInput
          label="E-mail do familiar"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <AccessibleButton label="Convidar familiar" onPress={handleInvite} loading={inviting} />
        {error && <AccessibleText variant="body" color={colors.danger} accessibilityLiveRegion="polite">{error}</AccessibleText>}
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(c) => c.id}
        style={{ marginTop: spacing.lg }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListEmptyComponent={
          <AccessibleText variant="body" color={colors.textSecondary}>
            Nenhum familiar cadastrado ainda.
          </AccessibleText>
        }
        renderItem={({ item }) => (
          <AccessibleCard>
            <AccessibleText variant="bodyLarge" bold>
              {item.caregiver.name}
            </AccessibleText>
            <AccessibleText variant="caption">{item.caregiver.email}</AccessibleText>
            <AccessibleText
              variant="caption"
              color={item.status === 'ACTIVE' ? colors.success : colors.warning}
              bold
            >
              {STATUS_LABELS[item.status]}
            </AccessibleText>
            {item.status === 'ACTIVE' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <AccessibleText variant="body" style={{ flex: 1 }}>Pode aprovar acessos</AccessibleText>
                <Switch accessibilityLabel={`Permitir aprovacoes por ${item.caregiver.name}`} value={item.permissions.includes('APPROVE_ACCESS')}
                  onValueChange={(allowed) => void toggleApproval(item, allowed)} />
              </View>
            )}
            {item.status !== 'REVOKED' && (
              <View style={{ marginTop: spacing.sm }}>
                <AccessibleButton label="Remover" variant="danger" onPress={() => handleRevoke(item)} />
              </View>
            )}
          </AccessibleCard>
        )}
      />

      <AccessibleButton label="Sair da conta" variant="secondary" onPress={() => void logout()} />
    </Screen>
  );
}
