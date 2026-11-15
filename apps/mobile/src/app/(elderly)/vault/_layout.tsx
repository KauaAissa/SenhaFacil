import { Stack } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';

export default function VaultStackLayout() {
  const reducedMotion = useReducedMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reducedMotion ? 'none' : 'fade',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Meu Cofre', headerShown: false }} />
      <Stack.Screen name="new" options={{ title: 'Nova Senha' }} />
      <Stack.Screen name="[id]" options={{ title: 'Detalhes' }} />
      <Stack.Screen name="edit" options={{ title: 'Editar senha' }} />
    </Stack>
  );
}
