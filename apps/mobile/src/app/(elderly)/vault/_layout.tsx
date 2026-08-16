import { Stack } from 'expo-router';
import { colors, fontSizes } from '../../../theme/theme';

export default function VaultStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontSize: fontSizes.title, color: colors.textPrimary },
        headerTintColor: colors.primary,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Meu Cofre' }} />
      <Stack.Screen name="new" options={{ title: 'Nova Senha' }} />
      <Stack.Screen name="[id]" options={{ title: 'Detalhes' }} />
    </Stack>
  );
}
