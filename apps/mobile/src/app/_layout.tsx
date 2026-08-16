import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useAuthStore } from '../stores/auth.store';
import { colors } from '../theme/theme';

/**
 * Root layout — runs session bootstrap once and gates all routing on it.
 * Each route group ((auth), (elderly), (caregiver)) has its own guard
 * (see useRequireRole) that redirects based on the resolved session.
 */
export default function RootLayout() {
  const { bootstrap, isReady } = useAuthStore();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
