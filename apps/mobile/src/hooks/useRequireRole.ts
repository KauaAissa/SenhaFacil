import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore, type UserRole } from '../stores/auth.store';

/**
 * Route guard: redirects away from a role-restricted group when the
 * authenticated user's role doesn't match, or when there is no session.
 *
 * Usage: call at the top of a group's `_layout.tsx` (e.g., (elderly)/_layout.tsx).
 */
export function useRequireRole(requiredRole: UserRole): { isChecking: boolean } {
  const { user, isReady } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isReady) return;

    if (!user) {
      router.replace('/(auth)/welcome');
      return;
    }

    if (user.role !== requiredRole) {
      router.replace(user.role === 'ELDERLY' ? '/(elderly)/vault' : '/(caregiver)/requests');
    }
    // segments included so the check re-runs on navigation within the group
  }, [user, isReady, requiredRole, router, segments]);

  return { isChecking: !isReady || !user || user.role !== requiredRole };
}
