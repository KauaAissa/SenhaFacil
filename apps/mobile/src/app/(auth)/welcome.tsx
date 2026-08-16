import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../components/ui/Screen';
import { AccessibleText } from '../../components/ui/AccessibleText';
import { AccessibleButton } from '../../components/ui/AccessibleButton';
import { spacing } from '../../theme/theme';

/**
 * Landing screen: the user picks whether they are the elderly person
 * managing their own vault, or a family caregiver providing assisted access.
 * The choice pre-selects the `role` sent to /auth/register.
 */
export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={{ marginTop: spacing.xl, marginBottom: spacing.xl }}>
        <AccessibleText variant="titleLarge">Senha Fácil</AccessibleText>
        <AccessibleText variant="bodyLarge" color="#3C4650" style={{ marginTop: spacing.sm }}>
          Guarde suas senhas com segurança e conte com a ajuda de quem você confia.
        </AccessibleText>
      </View>

      <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
        <AccessibleButton
          label="Sou o titular do cofre"
          accessibilityHint="Crie sua conta para guardar suas próprias senhas"
          onPress={() => router.push({ pathname: '/(auth)/register', params: { role: 'ELDERLY' } })}
        />
        <AccessibleButton
          label="Sou um familiar cuidador"
          variant="secondary"
          accessibilityHint="Crie sua conta para ajudar um familiar com acesso assistido"
          onPress={() => router.push({ pathname: '/(auth)/register', params: { role: 'CAREGIVER' } })}
        />
      </View>

      <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
        <AccessibleButton
          label="Já tenho conta — Entrar"
          variant="secondary"
          onPress={() => router.push('/(auth)/login')}
        />
      </View>
    </Screen>
  );
}
