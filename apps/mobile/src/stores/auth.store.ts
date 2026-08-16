import { create } from 'zustand';
import { apiClient } from '../services/api.client';
import { vaultCryptoService } from '../services/vault-crypto.service';
import { offlineVaultService } from '../services/offline-vault.service';
import { connectivityService } from '../services/connectivity.service';
import { syncService } from '../services/sync.service';
import { accessSocketService } from '../services/access-socket.service';
import { registerPushToken } from '../services/push-notifications.service';
import { generateSalt } from '@senha-facil/crypto';

export type UserRole = 'ELDERLY' | 'CAREGIVER';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  /** True once bootstrap() has finished — gates the initial route redirect. */
  isReady: boolean;
  isLoading: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Central authentication + session store.
 *
 * Owns the wiring between:
 *   - apiClient (JWT persistence)
 *   - vaultCryptoService (PBKDF2 key derivation + SecureStore, biometrics gate)
 *   - offlineVaultService (local SQLite init)
 *   - connectivityService / syncService (offline-first sync engine)
 *   - accessSocketService (real-time Assisted Access events for elderly)
 *   - push-notifications (FCM/Expo token registration)
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isReady: false,
  isLoading: false,
  error: null,

  /**
   * Runs once at app startup. Restores the session if a JWT is present:
   * loads the vault encryption key (triggers biometric/PIN prompt) and
   * fetches the current user profile.
   */
  bootstrap: async () => {
    await offlineVaultService.initialize();
    connectivityService.start();
    syncService.start();

    try {
      const hasToken = await apiClient.hasToken();
      if (!hasToken) {
        set({ isReady: true });
        return;
      }

      await vaultCryptoService.loadKey('Confirme sua identidade para abrir o Senha Fácil');
      const profile = await apiClient.get<AuthUser>('/users/me');

      set({ user: profile, isReady: true });
      void accessSocketService.connect();
      void registerPushToken();
    } catch {
      // Token invalid, key missing, or biometrics failed — force a fresh login.
      await apiClient.clearToken();
      set({ user: null, isReady: true });
    }
  },

  register: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const kdfSalt = generateSalt();

      const response = await apiClient.post<{ accessToken: string; user: AuthUser }>(
        '/auth/register',
        {
          name: input.name,
          email: input.email,
          phone: input.phone,
          password: input.password,
          kdfSalt,
          role: input.role,
        },
      );

      await apiClient.setToken(response.accessToken);
      await vaultCryptoService.initializeKey(input.password, kdfSalt);

      set({ user: response.user, isLoading: false });
      void accessSocketService.connect();
      void registerPushToken();
    } catch (err) {
      set({ isLoading: false, error: extractErrorMessage(err) });
      throw err;
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post<{
        accessToken: string;
        user: AuthUser & { kdfSalt: string };
      }>('/auth/login', { email, password });

      await apiClient.setToken(response.accessToken);
      await vaultCryptoService.initializeKey(password, response.user.kdfSalt);

      const { kdfSalt: _kdfSalt, ...user } = response.user;
      set({ user, isLoading: false });
      void accessSocketService.connect();
      void registerPushToken();
    } catch (err) {
      set({ isLoading: false, error: extractErrorMessage(err) });
      throw err;
    }
  },

  logout: async () => {
    accessSocketService.disconnect();
    await vaultCryptoService.clearKey();
    await apiClient.clearToken();
    set({ user: null });
  },
}));

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Ocorreu um erro inesperado. Tente novamente.';
}
