import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/auth.store';

/**
 * Entry route — redirects to the correct group based on session state.
 * RootLayout already waits for `isReady` before rendering the navigator,
 * so by the time this component mounts, `user` reflects the final state.
 */
export default function Index() {
  const { user } = useAuthStore();

  if (!user) return <Redirect href="/(auth)/welcome" />;

  return (
    <Redirect href={user.role === 'ELDERLY' ? '/(elderly)/vault' : '/(caregiver)/requests'} />
  );
}
