import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { AccessibleText } from '../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../components/ui/AccessibleButton';
import { useAuthStore, type UserRole } from '../../stores/auth.store';
import { spacing } from '../../theme/theme';

export default function RegisterScreen() {
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const role: UserRole = roleParam === 'CAREGIVER' ? 'CAREGIVER' : 'ELDERLY';
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const roleLabel = role === 'ELDERLY' ? 'Titular do cofre' : 'Familiar cuidador';

  async function handleSubmit() {
    setFieldError(null);

    if (!name.trim() || !email.trim() || !password) {
      setFieldError('Preencha todos os campos.');
      return;
    }
    if (password.length < 8) {
      setFieldError('A senha mestra deve ter ao menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setFieldError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      await register({ name: name.trim(), email: email.trim().toLowerCase(), password, role });
      router.replace(role === 'ELDERLY' ? '/(elderly)/vault' : '/(caregiver)/requests');
    } catch (err) {
      Alert.alert('Não foi possível criar sua conta', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <AccessibleText variant="title">Criar conta</AccessibleText>
      <AccessibleText variant="body" color="#3C4650" style={{ marginBottom: spacing.lg }}>
        Perfil selecionado: {roleLabel}
      </AccessibleText>

      <AccessibleTextInput
        label="Nome completo"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
      />
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
        label="Senha mestra (mínimo 8 caracteres)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
      />
      <AccessibleTextInput
        label="Confirme a senha mestra"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        errorMessage={fieldError ?? undefined}
      />

      <View style={{ marginTop: spacing.md }}>
        <AccessibleButton label="Criar conta" onPress={handleSubmit} loading={submitting} />
      </View>
    </Screen>
  );
}
