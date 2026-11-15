import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { ApiError, apiClient } from './api.client';
import { nativePromptService } from './native-prompt.service';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Requests notification permissions and registers the device's push token
 * with the backend (PATCH /users/me/fcm-token).
 *
 * Must be called after login/register, once the JWT is available, so the
 * server can associate the token with the authenticated user.
 *
 * Silently no-ops on failure — push is a best-effort channel; the Assisted
 * Access flow always has the WebSocket (elderly) and /access/pending polling
 * (caregiver) as fallbacks.
 */
export async function registerPushToken(deviceToken?: Notifications.DevicePushToken): Promise<void> {
  if (Platform.OS !== 'android' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return;
  let registrationStage = 'session';
  try {
    if (!(await apiClient.getToken())) return;
    registrationStage = 'channel';
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('sf_access_requests', {
        name: 'Solicitações de Acesso',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
      });
    }

    registrationStage = 'permission';
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await nativePromptService.run(() => Notifications.requestPermissionsAsync());
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    registrationStage = 'device-token';
    const { data: token } = deviceToken ?? await Notifications.getDevicePushTokenAsync();
    if (!token) return;

    registrationStage = 'api';
    if (!(await apiClient.getToken())) return;
    await apiClient.patch('/users/me/fcm-token', { fcmToken: token });
  } catch (error) {
    const nativeReason = error instanceof Error
      ? ['FIS_AUTH_ERROR', 'SERVICE_NOT_AVAILABLE', 'AUTHENTICATION_FAILED', 'INVALID_SENDER', 'SENDER_ID_MISMATCH', 'TIMEOUT', 'Network request failed']
        .find((reason) => error.message.includes(reason))
      : undefined;
    const reason = error instanceof ApiError ? `HTTP_${error.status}` : nativeReason ?? 'unknown';
    console.warn(`[NotificationsService] Push registration unavailable at ${registrationStage} (${reason}).`);
  }
}

export function listenPushTokenChanges(): () => void {
  if (Platform.OS !== 'android' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return () => undefined;
  const subscription = Notifications.addPushTokenListener((token) => { void registerPushToken(token); });
  return () => subscription.remove();
}
