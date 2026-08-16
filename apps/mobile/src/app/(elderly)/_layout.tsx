import { Tabs } from 'expo-router';
import { useRequireRole } from '../../hooks/useRequireRole';
import { colors, fontSizes } from '../../theme/theme';

export default function ElderlyLayout() {
  const { isChecking } = useRequireRole('ELDERLY');

  // useRequireRole triggers router.replace() as a side effect; render nothing
  // while the redirect resolves to avoid flashing elderly-only screens.
  if (isChecking) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: fontSizes.caption, fontWeight: '600' },
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 8 },
      }}
    >
      <Tabs.Screen name="vault" options={{ title: 'Meu Cofre' }} />
      <Tabs.Screen name="contacts" options={{ title: 'Familiares' }} />
    </Tabs>
  );
}
