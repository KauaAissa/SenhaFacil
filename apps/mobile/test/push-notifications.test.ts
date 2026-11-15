import * as Notifications from 'expo-notifications';
import { ApiError, apiClient } from '../src/services/api.client';
import { listenPushTokenChanges, registerPushToken } from '../src/services/push-notifications.service';
import { nativePromptService } from '../src/services/native-prompt.service';

jest.unmock('../src/services/push-notifications.service');
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'bare' },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 5 },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(apiClient, 'getToken').mockResolvedValue('session-token');
  jest.spyOn(apiClient, 'patch').mockResolvedValue(undefined);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted' } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.getDevicePushTokenAsync).mockResolvedValue({ type: 'android', data: 'device-token-secret' });
});

afterEach(() => jest.restoreAllMocks());

test('token events without a session do not request permission or call the API', async () => {
  jest.mocked(apiClient.getToken).mockResolvedValue(null);
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await registerPushToken();
  expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  expect(apiClient.patch).not.toHaveBeenCalled();
  expect(warning).not.toHaveBeenCalled();
});

test('an authenticated session with permission already granted registers its native token', async () => {
  await registerPushToken();
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('sf_access_requests', expect.objectContaining({ importance: 5 }));
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(apiClient.patch).toHaveBeenCalledWith('/users/me/fcm-token', { fcmToken: 'device-token-secret' });
});

test('a supplied native token is registered without fetching it again', async () => {
  await registerPushToken({ type: 'android', data: 'rotated-device-token' });
  expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  expect(apiClient.patch).toHaveBeenCalledTimes(1);
  expect(apiClient.patch).toHaveBeenCalledWith('/users/me/fcm-token', { fcmToken: 'rotated-device-token' });
});

test('token listener forwards the event token without restarting the native token event cycle', async () => {
  let registered!: () => void;
  const completed = new Promise<void>((resolve) => { registered = resolve; });
  jest.mocked(apiClient.patch).mockImplementation(async () => { registered(); });
  const stop = listenPushTokenChanges();
  const listener = jest.mocked(Notifications.addPushTokenListener).mock.calls[0][0];
  listener({ type: 'android', data: 'event-device-token' });
  await completed;
  expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  expect(apiClient.patch).toHaveBeenCalledTimes(1);
  expect(apiClient.patch).toHaveBeenCalledWith('/users/me/fcm-token', { fcmToken: 'event-device-token' });
  stop();
  expect(jest.mocked(Notifications.addPushTokenListener).mock.results[0].value.remove).toHaveBeenCalledTimes(1);
});

test('logout while obtaining the native token prevents an unauthenticated registration', async () => {
  jest.mocked(apiClient.getToken).mockResolvedValueOnce('session-token').mockResolvedValueOnce(null);
  await registerPushToken();
  expect(Notifications.getDevicePushTokenAsync).toHaveBeenCalledTimes(1);
  expect(apiClient.patch).not.toHaveBeenCalled();
});

test('denied notification permission does not obtain or register a token', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied' } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: 'denied' } as Notifications.NotificationPermissionsStatus);
  await registerPushToken();
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  expect(apiClient.patch).not.toHaveBeenCalled();
});

test('notification permission is scoped as a native prompt rather than a second login', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied' } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.requestPermissionsAsync).mockImplementation(async () => {
    expect(nativePromptService.isActive).toBe(true);
    return { status: 'denied' } as Notifications.NotificationPermissionsStatus;
  });
  expect(nativePromptService.isActive).toBe(false);
  await registerPushToken();
  expect(nativePromptService.isActive).toBe(false);
});

test('API diagnostics expose only stage and status, not the response body or device token', async () => {
  jest.mocked(apiClient.patch).mockRejectedValue(new ApiError(401, 'private-response device-token-secret'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await expect(registerPushToken()).resolves.toBeUndefined();
  expect(warning).toHaveBeenCalledWith('[NotificationsService] Push registration unavailable at api (HTTP_401).');
  expect(JSON.stringify(warning.mock.calls)).not.toMatch(/private-response|device-token-secret/);
});

test('native diagnostics expose only recognized error categories', async () => {
  jest.mocked(Notifications.getDevicePushTokenAsync).mockRejectedValue(new Error('SERVICE_NOT_AVAILABLE private-native-details'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await expect(registerPushToken()).resolves.toBeUndefined();
  expect(warning).toHaveBeenCalledWith('[NotificationsService] Push registration unavailable at device-token (SERVICE_NOT_AVAILABLE).');
  expect(JSON.stringify(warning.mock.calls)).not.toContain('private-native-details');
  expect(apiClient.patch).not.toHaveBeenCalled();
});