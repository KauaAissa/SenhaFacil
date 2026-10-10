import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { AccessibleText } from '../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../components/ui/AccessibleButton';
import { accountSecurityService } from '../../services/account-security.service';
import { useAuthStore } from '../../stores/auth.store';
import { spacing } from '../../theme/theme';

export default function RecoveryScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  async function recover() {
    if (password.length < 8 || password.length > 128 || password !== confirmation) { Alert.alert('Confira a nova senha', 'Use de 8 a 128 caracteres e repita a mesma senha.'); return; }
    const secret = code; const next = password;
    setCode(''); setPassword(''); setConfirmation(''); setLoading(true);
    try { await accountSecurityService.recover(email, secret, next); await useAuthStore.getState().login(email, next); }
    catch { Alert.alert('Recuperacao nao concluida', 'Confira o codigo e a conexao. Se a troca ja foi aceita, entre com a nova senha. Sem um kit valido, nao e possivel recuperar o conteudo cifrado.'); }
    finally { setLoading(false); }
  }
  return <Screen style={{ maxWidth: 560 }}>
    <AccessibleButton label="Voltar para entrar" icon="arrow-back-outline" variant="secondary" onPress={() => router.back()} />
    <AccessibleText variant="title" style={{ marginVertical: spacing.lg }}>Recuperar meu cofre</AccessibleText>
    <AccessibleText style={{ marginBottom: spacing.md }}>Use o codigo que voce guardou fora do celular. Um novo kit sera gerado ao concluir.</AccessibleText>
    <AccessibleTextInput label="E-mail da conta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={254} />
    <AccessibleTextInput label="Codigo de recuperacao" value={code} onChangeText={setCode} autoCapitalize="characters" secureTextEntry maxLength={100} autoComplete="off" />
    <AccessibleTextInput label="Nova senha mestra" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} />
    <AccessibleTextInput label="Repetir nova senha" value={confirmation} onChangeText={setConfirmation} secureTextEntry maxLength={128} />
    <View style={{ marginTop: spacing.md }}><AccessibleButton label="Recuperar cofre" icon="shield-checkmark-outline" loading={loading} disabled={!email.trim() || !code || !password || !confirmation} onPress={() => void recover()} /></View>
  </Screen>;
}