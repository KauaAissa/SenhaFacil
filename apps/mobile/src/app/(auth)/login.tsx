import { useState } from 'react';
import { View, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { AccessibleText } from '../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../components/ui/AccessibleButton';
import { useAuthStore } from '../../stores/auth.store';
import { colors, spacing } from '../../theme/theme';
import appIcon from '../../../assets/icon.png';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const phase = useAuthStore((s) => s.authPhase);
  const pendingLabel = phase === 'parameters' ? 'Conectando...' : phase === 'authenticating' ? 'Validando acesso...' : 'Abrindo cofre...';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      Alert.alert('Preencha e-mail e senha para continuar.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // useAuthStore.user is updated synchronously by the time login() resolves;
      // index.tsx will redirect based on the resolved role.
      router.replace('/');
    } catch (err) {
      Alert.alert('Não foi possível entrar', err instanceof Error ? err.message : String(err));
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  }

  return (
    <Screen style={{ maxWidth: 560 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.xl }}>
        <Image source={appIcon} style={{ width: 64, height: 64, borderRadius: 8 }} accessible={false} />
        <View style={{ flex: 1 }}><AccessibleText variant="titleLarge">Senha Fácil</AccessibleText>
          <AccessibleText variant="caption" color={colors.textSecondary}>Seu cofre pessoal</AccessibleText></View>
      </View>
      <AccessibleText variant="title" style={{ marginBottom: spacing.lg }}>Entrar no cofre</AccessibleText>

      <AccessibleTextInput
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <AccessibleTextInput
        label="Senha mestra"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
      />

      <View style={{ marginTop: spacing.md }}>
        <AccessibleButton label={submitting ? pendingLabel : 'Entrar'} icon="lock-open-outline" onPress={handleSubmit} loading={submitting} />
      </View>
      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        <AccessibleButton label="Esqueci a senha mestra" icon="key-outline" variant="secondary" disabled={submitting} onPress={() => router.push('/(auth)/recovery')} />
        <AccessibleButton label="Criar minha conta" icon="person-add-outline" variant="secondary" disabled={submitting} onPress={() => router.push('/(auth)/register')} />
      </View>
    </Screen>
  );
}
