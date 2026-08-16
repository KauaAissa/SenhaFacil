import { Stack } from 'expo-router';
import { useRequireRole } from '../../hooks/useRequireRole';
import { colors, fontSizes } from '../../theme/theme';

export default function CaregiverLayout() {
  const { isChecking } = useRequireRole('CAREGIVER');

  if (isChecking) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontSize: fontSizes.title, color: colors.textPrimary },
        headerTintColor: colors.primary,
      }}
    >
      <Stack.Screen name="requests/index" options={{ title: 'Solicitações' }} />
    </Stack>
  );
}
