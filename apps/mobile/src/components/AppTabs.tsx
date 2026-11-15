import { Tabs } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { PlatformPressable } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccessibilityStore } from '../stores/accessibility.store';
import { useThemeColors } from '../hooks/useThemeColors';
import { AccessibleText } from './ui/AccessibleText';
import type { IconName } from './ui/Presentation';
import { TabScreenContext } from './ui/KeyboardFocusContext';

export function AppTabs({ caregiver = false }: { caregiver?: boolean }) {
  const colors = useThemeColors();
  const textScale = useAccessibilityStore((state) => state.textScale);
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const primaryTabs: { name: string; title: string; icon: IconName }[] = caregiver ?
    [{ name: 'requests/index', title: 'Pedidos', icon: 'chatbubbles-outline' }] :
    [{ name: 'vault', title: 'Cofre', icon: 'key-outline' }, { name: 'contacts/index', title: 'Família', icon: 'people-outline' }];
  function options(title: string, icon: IconName) {
    return {
      title,
      tabBarAccessibilityLabel: title,
      tabBarItemStyle: { flex: title.length + 1, minHeight: 64 },
      tabBarLabel: ({ focused }: { focused: boolean }) =>
        <AccessibleText variant="caption" bold={focused} color={focused ? colors.primary : colors.textSecondary}
          style={{ textAlign: 'center', maxWidth: '100%' }}>{title}</AccessibleText>,
      tabBarIcon: ({ focused }: { focused: boolean }) => <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{ width: 52, height: 32, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.primarySoft : 'transparent',
        borderWidth: focused ? 1 : 0, borderColor: colors.primary }}>
        <Ionicons name={icon} size={23} color={focused ? colors.primary : colors.textSecondary} accessible={false} />
      </View>,
    };
  }
  return <TabScreenContext.Provider value><Tabs backBehavior="history" screenOptions={{
    headerShown: false,
    tabBarHideOnKeyboard: true,
    tabBarLabelPosition: 'below-icon',
    tabBarButton: (props) => <PlatformPressable {...props} style={[props.style, { paddingHorizontal: 0 }]} />,
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, elevation: 0, shadowOpacity: 0,
      height: 82 + insets.bottom + Math.max(0, textScale * fontScale - 1) * 60, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) },
    tabBarItemStyle: { minHeight: 64 },
  }}>
    {primaryTabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} options={options(tab.title, tab.icon)} />)}
    <Tabs.Screen name="history" options={options('Histórico', 'time-outline')} />
    <Tabs.Screen name="profile" options={options('Conta', 'person-circle-outline')} />
    <Tabs.Screen name="security" options={{ href: null }} />
    <Tabs.Screen name="security-activity" options={{ href: null }} />
    <Tabs.Screen name="sessions" options={{ href: null }} />
  </Tabs></TabScreenContext.Provider>;
}
