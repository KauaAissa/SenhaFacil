import { Tabs } from 'expo-router';
import { useRequireRole } from '../../hooks/useRequireRole';
import { colors, fontSizes } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAccessibilityStore } from '../../stores/accessibility.store';

export default function ElderlyLayout() {
  const textScale = useAccessibilityStore((state) => state.textScale);
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
        tabBarStyle: { minHeight: textScale > 1 ? 88 : 76, height: 'auto', paddingBottom: 8, paddingTop: 8, backgroundColor: colors.background, borderTopColor: colors.border },
        tabBarItemStyle: { minHeight: 60 },
      }}
    >
      <Tabs.Screen name="vault" options={{ title: 'Cofre', tabBarAccessibilityLabel: 'Meu cofre', tabBarIcon: ({ color }) => <Ionicons accessible={false} name="lock-closed-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="contacts/index" options={{ title: 'Familiares', tabBarAccessibilityLabel: 'Familiares', tabBarIcon: ({ color }) => <Ionicons accessible={false} name="people-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: 'Historico', tabBarAccessibilityLabel: 'Historico de acessos', tabBarIcon: ({ color }) => <Ionicons accessible={false} name="time-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Conta', tabBarAccessibilityLabel: 'Minha conta', tabBarIcon: ({ color }) => <Ionicons accessible={false} name="person-circle-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="security" options={{ href: null }} />
    </Tabs>
  );
}
