import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { AccessibleText } from '../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../components/ui/AccessibleButton';
import { useAuthStore } from '../../stores/auth.store';
import { spacing } from '../../theme/theme';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

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
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <AccessibleText variant="title" style={{ marginBottom: spacing.lg }}>
        Entrar
      </AccessibleText>

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
        <AccessibleButton label="Entrar" onPress={handleSubmit} loading={submitting} />
      </View>
    </Screen>
  );
}
