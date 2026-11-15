import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { AccessibleTextInput } from '../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../components/ui/AccessibleButton';
import { accountSecurityService } from '../../services/account-security.service';
import { useAuthStore } from '../../stores/auth.store';
import { spacing } from '../../theme/theme';
import { AccessibleCard } from '../../components/ui/AccessibleCard';
import { Notice, ScreenHeading, SectionHeading } from '../../components/ui/Presentation';
import { SupportTools } from '../../components/SupportTools';
import { loginIdentifierError } from '../../services/input-validation';
import { getErrorMessage } from '../../services/error-messages';

export default function RecoveryScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function recover() {
    const invalidEmail = loginIdentifierError(email);
    if (invalidEmail) { setError(invalidEmail); return; }
    if (password.length < 8 || password.length > 128 || password !== confirmation) { setError('Use de 8 a 128 caracteres e repita a mesma senha.'); return; }
    const secret = code; const next = password;
    setCode(''); setPassword(''); setConfirmation(''); setLoading(true); setError('');
    try { await accountSecurityService.recover(email, secret, next); await useAuthStore.getState().login(email, next); }
    catch (error) { setError(getErrorMessage(error, 'Confira o código e a conexão. Se a troca já foi aceita, entre com a nova senha. Sem um kit válido, não é possível recuperar o conteúdo cifrado.')); }
    finally { setLoading(false); }
  }
  return <Screen style={{ maxWidth: 560 }}>
    <ScreenHeading title="Vamos recuperar seu cofre" eyebrow="RECUPERAÇÃO" icon="key-outline"
      description="Você vai precisar do kit que guardou fora do celular e de conexão com a internet." onBack={() => router.back()} />
    <AccessibleCard>
    <SectionHeading title="1. Identifique sua conta" />
    <AccessibleTextInput label="E-mail ou celular usado na conta" value={email} onChangeText={setEmail} keyboardType="default" autoCapitalize="none" autoCorrect={false} maxLength={254} />
    <AccessibleTextInput label="Codigo de recuperacao" value={code} onChangeText={setCode} autoCapitalize="characters" secureTextEntry maxLength={100} autoComplete="off" />
    <SectionHeading title="2. Escolha uma nova senha" description="Use de 8 a 128 caracteres." />
    <AccessibleTextInput label="Nova senha mestra" value={password} onChangeText={setPassword} secureTextEntry maxLength={128} />
    <AccessibleTextInput label="Repetir nova senha" value={confirmation} onChangeText={setConfirmation} secureTextEntry maxLength={128} />
    {Boolean(error) && <Notice tone="danger" title="Recuperação não concluída">{error}</Notice>}
    <Notice tone="warning">Um novo kit será gerado. O kit anterior deixará de funcionar e as outras sessões online serão encerradas.</Notice>
    <View style={{ marginTop: spacing.md }}><AccessibleButton label="Recuperar cofre" icon="shield-checkmark-outline" loading={loading} disabled={!email.trim() || !code || !password || !confirmation} onPress={() => void recover()} /></View>
    </AccessibleCard>
    <SupportTools />
  </Screen>;
}