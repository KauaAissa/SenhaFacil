import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from './api.client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
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
export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('sf_access_requests', {
        name: 'Solicitações de Acesso',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (!token) return;

    await apiClient.patch('/users/me/fcm-token', { fcmToken: token });
  } catch (error) {
    console.warn('[NotificationsService] Failed to register push token:', error);
  }
}
