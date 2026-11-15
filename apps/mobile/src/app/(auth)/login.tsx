import { useState } from 'react';
import { View, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { AccessibleText } from '../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../components/ui/AccessibleButton';
import { useAuthStore } from '../../stores/auth.store';
import { spacing, radii } from '../../theme/theme';
import appIcon from '../../../assets/icon.png';
import { useThemeColors } from '../../hooks/useThemeColors';
import { AccessibleCard } from '../../components/ui/AccessibleCard';
import { HeroCard, SectionHeading, Notice } from '../../components/ui/Presentation';
import { SupportTools } from '../../components/SupportTools';
import { loginIdentifierError } from '../../services/input-validation';
import { getErrorMessage } from '../../services/error-messages';

export default function LoginScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const phase = useAuthStore((s) => s.authPhase);
  const sessionError = useAuthStore((s) => s.error);
  const pendingLabel = phase === 'parameters' ? 'Conectando...' : phase === 'authenticating' ? 'Validando acesso...' : 'Abrindo cofre...';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError('Preencha seu e-mail ou celular e a senha mestra para continuar.');
      return;
    }
    const invalidEmail = loginIdentifierError(email);
    if (invalidEmail) { setError(invalidEmail); return; }

    setSubmitting(true);
    setError('');
    try {
      await login(email.trim().toLowerCase(), password);
      // useAuthStore.user is updated synchronously by the time login() resolves;
      // index.tsx will redirect based on the resolved role.
      router.replace('/');
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível entrar. Confira os dados e tente novamente.'));
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  }

  return (
    <Screen style={{ maxWidth: 560 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <Image source={appIcon} style={{ width: 48, height: 48, borderRadius: radii.sm }} accessible={false} />
        <View style={{ flex: 1 }}><AccessibleText variant="bodyLarge" bold>Senha Fácil</AccessibleText>
          <AccessibleText variant="caption" color={colors.textSecondary}>Cuidado com a sua vida digital</AccessibleText></View>
      </View>
      <HeroCard title="Suas senhas. Seu sossego." description="Tudo organizado, com você no controle." eyebrow="Bem-vindo ao seu cofre" />
      <AccessibleCard>
      <SectionHeading title="Entrar no cofre" description="Use a senha mestra da sua conta." />
      <AccessibleTextInput
        label="E-mail ou celular com DDD"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="default"
        autoComplete="username"
        textContentType="username"
        autoCorrect={false}
        hint="Use o mesmo e-mail ou celular escolhido ao criar a conta."
        maxLength={254}
        editable={!submitting}
      />
      <AccessibleTextInput
        label="Senha mestra"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        editable={!submitting}
        onSubmitEditing={() => { if (!submitting) void handleSubmit(); }}
      />
      {Boolean(error || sessionError) && <Notice tone="danger" title="Confira para continuar">{error || sessionError}</Notice>}
      <View style={{ marginTop: spacing.md }}>
        <AccessibleButton label={submitting ? pendingLabel : 'Entrar'} icon="lock-open-outline" onPress={handleSubmit} loading={submitting} />
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <AccessibleButton label="Esqueci a senha mestra" icon="key-outline" variant="quiet" disabled={submitting} onPress={() => router.push('/(auth)/recovery')} />
      </View>
      </AccessibleCard>
      <View style={{ gap: spacing.sm }}>
        <AccessibleText variant="caption" style={{ textAlign: 'center' }}>Primeira vez por aqui?</AccessibleText>
        <AccessibleButton label="Criar minha conta" icon="person-add-outline" variant="secondary" disabled={submitting} onPress={() => router.push('/(auth)/register')} />
      </View>
      <SupportTools />
    </Screen>
  );
}
