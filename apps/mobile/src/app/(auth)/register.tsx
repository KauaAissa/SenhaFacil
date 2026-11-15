import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { AccessibleText } from '../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../components/ui/AccessibleButton';
import { useAuthStore, type UserRole } from '../../stores/auth.store';
import { spacing } from '../../theme/theme';
import { AccessibleCard } from '../../components/ui/AccessibleCard';
import { ChoiceChip } from '../../components/ui/ChoiceChip';
import { ScreenHeading, SectionHeading, Notice } from '../../components/ui/Presentation';
import { SupportTools } from '../../components/SupportTools';
import { loginIdentifierError } from '../../services/input-validation';
import { getErrorMessage } from '../../services/error-messages';

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
    if (name.trim().length < 2) { setFieldError('Informe um nome com pelo menos 2 caracteres.'); return; }
    const invalidEmail = loginIdentifierError(email);
    if (invalidEmail) { setFieldError(invalidEmail); return; }
    if (password.length < 8 || password.length > 128) {
      setFieldError('Use de 8 a 128 caracteres na senha mestra.');
      return;
    }
    if (password !== confirmPassword) {
      setFieldError('As senhas não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      await register({ name: name.trim(), identifier: email, password, role });
    } catch (err) {
      setFieldError(getErrorMessage(err, 'Não foi possível criar a conta. Confira os dados e tente novamente.'));
    } finally {
      setPassword(''); setConfirmPassword('');
      setSubmitting(false);
    }
  }

  return (
    <Screen style={{ maxWidth: 560 }}>
      <ScreenHeading title="Um começo mais tranquilo" eyebrow="CRIAR CONTA" icon="person-add-outline"
        description="Escolha como você vai usar o Senha Fácil." onBack={() => router.back()} />
      <AccessibleCard>
        <SectionHeading title="Esta conta é para..." />
        <View style={{ gap: spacing.sm }}>
          <ChoiceChip label="Guardar minhas senhas" icon="key-outline" selected={role === 'ELDERLY'} disabled={submitting} onPress={() => setRole('ELDERLY')} />
          <ChoiceChip label="Ajudar um familiar" icon="people-outline" selected={role === 'CAREGIVER'} disabled={submitting} onPress={() => setRole('CAREGIVER')} />
        </View>
        <AccessibleText variant="caption" style={{ marginTop: spacing.md }}>{roleLabel}</AccessibleText>
      </AccessibleCard>
      <AccessibleCard>
      <SectionHeading title="Seus dados de entrada" />
      <AccessibleTextInput
        label="Nome completo"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        maxLength={100}
      />
      <AccessibleTextInput
        label="E-mail ou celular com DDD"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="default"
        autoComplete="username"
        textContentType="username"
        autoCorrect={false}
        hint="Escolha um deles para entrar. Celular brasileiro: DDD e número, como (11) 91234-5678."
        maxLength={254}
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
        maxLength={128}
      />
      {fieldError && <Notice tone="danger">{fieldError}</Notice>}
      <Notice tone="primary" icon="document-lock-outline">Você sempre entrará com a senha mestra. Não enviamos códigos por SMS ou e-mail. Guarde o kit que será exibido após o cadastro: ele é necessário para recuperar o cofre.</Notice>
      <View style={{ marginTop: spacing.md }}>
        <AccessibleButton label="Criar conta" icon="person-add-outline" onPress={handleSubmit} loading={submitting} />
      </View>
      </AccessibleCard>
      <SupportTools />
    </Screen>
  );
}
