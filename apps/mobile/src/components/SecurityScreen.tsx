import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleTextInput } from './ui/AccessibleTextInput';
import { AccessibleButton } from './ui/AccessibleButton';
import { useAuthStore } from '../stores/auth.store';
import { spacing } from '../theme/theme';

export default function SecurityScreen() {
  const router = useRouter();
  const { changePassword, generateRecoveryKit, isLoading } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function change() {
    if (next.length < 8 || next.length > 128 || next !== confirmation) { Alert.alert('Confira a nova senha', 'Use de 8 a 128 caracteres e repita a mesma senha.'); return; }
    const password = current; const replacement = next;
    setCurrent(''); setNext(''); setConfirmation('');
    try { await changePassword(password, replacement); Alert.alert('Senha alterada', 'As outras sessoes foram encerradas.'); }
    catch { Alert.alert('Troca nao concluida', 'Confira a senha atual e a conexao. Se a alteracao ja foi aceita, entre novamente com a nova senha. Contas antigas precisam preparar o kit primeiro.'); }
  }
  function kit() {
    const password = current; setCurrent('');
    Alert.alert('Gerar novo kit?', 'O kit anterior deixara de funcionar e as outras sessoes serao encerradas. Suas senhas salvas permanecerao intactas.', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Gerar kit', onPress: async () => {
        try { await generateRecoveryKit(password); }
        catch { Alert.alert('Kit nao concluido', 'Confira a senha e a conexao. Se a operacao ja foi aceita, entre novamente.'); }
      } },
    ]);
  }
  return <Screen>
    <AccessibleButton label="Voltar" icon="arrow-back-outline" variant="secondary" onPress={() => router.back()} />
    <AccessibleText variant="title" style={{ marginVertical: spacing.lg }}>Seguranca do cofre</AccessibleText>
    <AccessibleTextInput label="Senha mestra atual" value={current} onChangeText={setCurrent} secureTextEntry maxLength={128} autoComplete="off" />
    <AccessibleText variant="bodyLarge" bold>Trocar senha mestra</AccessibleText>
    <AccessibleTextInput label="Nova senha mestra" value={next} onChangeText={setNext} secureTextEntry maxLength={128} autoComplete="new-password" />
    <AccessibleTextInput label="Repetir nova senha" value={confirmation} onChangeText={setConfirmation} secureTextEntry maxLength={128} />
    <AccessibleButton label="Alterar senha" icon="key-outline" loading={isLoading} disabled={!current || !next || !confirmation} onPress={() => void change()} />
    <View style={{ marginVertical: spacing.xl, gap: spacing.md }}>
      <AccessibleText variant="bodyLarge" bold>Kit de recuperacao</AccessibleText>
      <AccessibleText>Prepare um kit para uma conta antiga ou substitua um codigo perdido. E necessario guardar o novo codigo fora deste aparelho.</AccessibleText>
      <AccessibleButton label="Gerar novo kit" icon="shield-checkmark-outline" variant="secondary" disabled={!current || isLoading} onPress={kit} />
    </View>
  </Screen>;
}