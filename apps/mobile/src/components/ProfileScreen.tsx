import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleTextInput } from './ui/AccessibleTextInput';
import { AccessibleButton } from './ui/AccessibleButton';
import { useAuthStore } from '../stores/auth.store';
import { spacing } from '../theme/theme';
import { textScales, useAccessibilityStore } from '../stores/accessibility.store';
import { useRouter } from 'expo-router';
import { AccessibleSwitch } from './ui/AccessibleSwitch';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, deleteAccount, logout, lock, isLoading } = useAuthStore();
  const { textScale, highContrast, setTextScale, setHighContrast } = useAccessibilityStore();
  const [name, setName] = useState(user?.name ?? '');
  const [surname, setSurname] = useState(user?.surname ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [birth, setBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const date = user?.dateOfBirth?.slice(0, 10).split('-');
    setBirth(date ? `${date[2]}/${date[1]}/${date[0]}` : '');
    return () => setPassword('');
  }, [user?.dateOfBirth]);

  async function save() {
    const match = birth.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (birth.trim() && !match) { Alert.alert('Data invalida', 'Informe dia/mes/ano.'); return; }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), surname: surname.trim(), phone: phone.trim() || null,
        dateOfBirth: match ? `${match[3]}-${match[2]}-${match[1]}` : null });
      Alert.alert('Perfil atualizado.');
    } catch { Alert.alert('Nao foi possivel salvar', 'Verifique os dados e a conexao.'); }
    finally { setSaving(false); }
  }

  function remove() {
    const entered = password;
    setPassword('');
    Alert.alert('Excluir conta permanentemente?', 'Seu cofre, perfil e vinculos serao removidos. Esta acao nao pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Excluir conta', style: 'destructive', onPress: async () => {
        try { await deleteAccount(entered); }
        catch { Alert.alert('Nao foi possivel concluir', 'Confira sua senha e a conexao. Se a conta foi removida, feche o app e verifique a limpeza local.'); }
      } },
    ]);
  }
  return (
    <Screen>
      <AccessibleText variant="title">Minha conta</AccessibleText>
      <AccessibleText variant="body">{user?.email}</AccessibleText>
      <AccessibleTextInput label="Nome" value={name} onChangeText={setName} maxLength={100} />
      <AccessibleTextInput label="Sobrenome (opcional)" value={surname} onChangeText={setSurname} maxLength={100} />
      <AccessibleTextInput label="Telefone (opcional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <AccessibleTextInput label="Nascimento (dia/mes/ano, opcional)" value={birth} onChangeText={setBirth} keyboardType="numbers-and-punctuation" maxLength={10} />
      <AccessibleButton label="Salvar perfil" icon="save-outline" onPress={save} loading={saving} />
      <View style={{ gap: spacing.md, marginVertical: spacing.lg }}>
        <AccessibleText variant="bodyLarge" bold>Legibilidade</AccessibleText>
        <AccessibleSwitch label="Contraste reforcado" value={highContrast}
          onValueChange={(enabled) => { void setHighContrast(enabled).catch(() => Alert.alert('Preferencia nao salva.')); }} />
        <AccessibleText variant="body">Tamanho do texto: {Math.round(textScale * 100)}%</AccessibleText>
        <AccessibleButton label="Aumentar texto" icon="add-outline" disabled={textScale === 1.4}
          onPress={() => { void setTextScale(textScales[Math.min(textScales.indexOf(textScale) + 1, 2)]).catch(() => Alert.alert('Preferencia nao salva.')); }} />
        <AccessibleButton label="Diminuir texto" icon="remove-outline" variant="secondary" disabled={textScale === 1}
          onPress={() => { void setTextScale(textScales[Math.max(textScales.indexOf(textScale) - 1, 0)]).catch(() => Alert.alert('Preferencia nao salva.')); }} />
      </View>
      <View style={{ gap: spacing.md, marginVertical: spacing.lg }}>
        <AccessibleButton label="Senha mestra e recuperacao" icon="shield-checkmark-outline" variant="secondary"
          onPress={() => router.push(user?.role === 'CAREGIVER' ? '/(caregiver)/security' : '/(elderly)/security')} />
        <AccessibleButton label="Bloquear cofre" icon="lock-closed-outline" variant="secondary" onPress={lock} />
        <AccessibleButton label="Sair da conta" icon="log-out-outline" variant="secondary" onPress={() => void logout()} disabled={isLoading} />
      </View>
      <AccessibleText variant="body">Privacidade</AccessibleText>
      <AccessibleText variant="body">O conteudo do cofre e cifrado no aparelho. Nomes e categorias dos itens, perfil e historico ficam no servidor. Familiares autorizados veem solicitacoes e historico, nao suas senhas.</AccessibleText>
      <AccessibleText variant="body">Contas com kit de recuperacao usam uma credencial derivada para entrar na API, sem enviar a senha mestra. Contas antigas precisam preparar o kit para migrar. A exclusao remove os dados ativos; backups dependem da politica de hospedagem.</AccessibleText>
      <AccessibleText variant="body">O historico resolvido tem retencao de 365 dias, com limpeza diaria. A exclusao limpa este aparelho; copias offline em outros aparelhos precisam ser apagadas neles.</AccessibleText>
      <AccessibleTextInput label="Digite EXCLUIR" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
      <AccessibleTextInput label="Senha de entrada" value={password} onChangeText={setPassword} secureTextEntry />
      <AccessibleButton label="Excluir minha conta" icon="trash-outline" variant="danger" disabled={confirmation !== 'EXCLUIR' || !password || isLoading} onPress={remove} />
    </Screen>
  );
}