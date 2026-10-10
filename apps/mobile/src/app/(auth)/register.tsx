import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { AccessibleText } from '../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../components/ui/AccessibleButton';
import { useAuthStore, type UserRole } from '../../stores/auth.store';
import { spacing } from '../../theme/theme';
import { AccessibleSwitch } from '../../components/ui/AccessibleSwitch';

export default function RegisterScreen() {
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const [role, setRole] = useState<UserRole>(roleParam === 'CAREGIVER' ? 'CAREGIVER' : 'ELDERLY');
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
    if (password.length < 8 || password.length > 128) {
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
    } catch (err) {
      Alert.alert('Não foi possível criar sua conta', err instanceof Error ? err.message : String(err));
    } finally {
      setPassword(''); setConfirmPassword('');
      setSubmitting(false);
    }
  }

  return (
    <Screen style={{ maxWidth: 560 }}>
      <AccessibleButton label="Voltar para entrar" icon="arrow-back-outline" variant="secondary" onPress={() => router.back()} />
      <AccessibleText variant="title" style={{ marginTop: spacing.lg }}>Criar conta</AccessibleText>
      <AccessibleSwitch label="Sou familiar cuidador" value={role === 'CAREGIVER'} disabled={submitting}
        onValueChange={(enabled) => setRole(enabled ? 'CAREGIVER' : 'ELDERLY')} />
      <AccessibleText variant="caption" style={{ marginBottom: spacing.md }}>{roleLabel}</AccessibleText>

      <AccessibleTextInput
        label="Nome completo"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        maxLength={100}
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
        maxLength={128}
      />
      <AccessibleTextInput
        label="Confirme a senha mestra"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        errorMessage={fieldError ?? undefined}
        maxLength={128}
      />

      <View style={{ marginTop: spacing.md }}>
        <AccessibleButton label="Criar conta" icon="person-add-outline" onPress={handleSubmit} loading={submitting} />
      </View>
    </Screen>
  );
}
