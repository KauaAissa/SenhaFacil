import { requireOptionalNativeModule } from 'expo';
import * as Location from 'expo-location';
import { requestLocationService, pointFromFix } from '../src/services/request-location.service';
import { nativePromptService } from '../src/services/native-prompt.service';
import { apiClient } from '../src/services/api.client';
import { accessApiService } from '../src/services/access-api.service';

function fix(overrides: Partial<Location.LocationObject> = {}): Location.LocationObject {
  return { coords: { latitude: 0, longitude: 0, accuracy: 80, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(), ...overrides };
}
function permission(granted: boolean, canAskAgain = true): Location.LocationPermissionResponse {
  return { granted, canAskAgain, status: granted ? Location.PermissionStatus.GRANTED : Location.PermissionStatus.DENIED, expires: 'never' };
}

beforeEach(() => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue({});
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission(true));
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(permission(true));
  jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);
  jest.mocked(Location.getCurrentPositionAsync).mockImplementation(async () => fix());
  jest.clearAllMocks();
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('permission is requested in a native prompt scope, without reading any position', async () => {
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission(false));
  jest.mocked(Location.requestForegroundPermissionsAsync).mockImplementation(async () => {
    expect(nativePromptService.isActive).toBe(true);
    return permission(true);
  });
  await requestLocationService.requirePermission();
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(Location.hasServicesEnabledAsync).not.toHaveBeenCalled();
  expect(nativePromptService.isActive).toBe(false);
});

test('granted permission is reused without prompting or collecting a position', async () => {
  await requestLocationService.requirePermission();
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test.each([true, false])('denied permission blocks activation, including permanent denial (%s)', async (canAskAgain) => {
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission(false, canAskAgain));
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(permission(false, canAskAgain));
  await expect(requestLocationService.requirePermission()).rejects.toThrow('senhas comuns');
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(canAskAgain ? 1 : 0);
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test('older APK gets actionable activation guidance instead of a missing-module crash', async () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  await expect(requestLocationService.requirePermission()).rejects.toThrow('nova versão Android');
  expect(await requestLocationService.captureOnce()).toMatchObject({ available: false, message: expect.stringContaining('nova versão Android') });
});

test('requests read a single fix and use server-anchored time even with device clock skew', async () => {
  const serverTime = Date.now() - 387_000;
  jest.spyOn(apiClient, 'getServerTime').mockReturnValue(serverTime);
  const result = await requestLocationService.captureOnce();
  expect(result).toMatchObject({ available: true, location: { latitude: 0, longitude: 0, accuracy: 80 } });
  if (result.available) expect(Math.abs(Date.parse(result.location.capturedAt) - serverTime)).toBeLessThan(1_000);
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false });
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

test.each(['permission', 'gps', 'native-error'] as const)('unavailable location is explicit and never becomes invented coordinates (%s)', async (reason) => {
  if (reason === 'permission') jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission(false));
  if (reason === 'gps') jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(false);
  if (reason === 'native-error') jest.mocked(Location.getCurrentPositionAsync).mockRejectedValue(new Error('private-native-details'));
  const result = await requestLocationService.captureOnce();
  expect(result).toMatchObject({ available: false, message: expect.any(String) });
  expect(result).not.toHaveProperty('location');
  expect(JSON.stringify(result)).not.toContain('private-native-details');
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

test('timeout stops waiting after twelve seconds and does not send a late position', async () => {
  jest.useFakeTimers();
  let release: (value: Location.LocationObject) => void = () => undefined;
  jest.mocked(Location.getCurrentPositionAsync).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const pending = requestLocationService.captureOnce();
  await jest.advanceTimersByTimeAsync(12_000);
  expect(await pending).toMatchObject({ available: false, message: expect.stringContaining('demorou') });
  release(fix());
  await Promise.resolve();
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
});

test('a session change while reading permissions prevents starting a location read', async () => {
  let current = true;
  jest.mocked(Location.getForegroundPermissionsAsync).mockImplementation(async () => {
    current = false;
    return permission(true);
  });
  expect(await requestLocationService.captureOnce(() => current)).toMatchObject({ available: false });
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test('a slow preflight cannot start collecting after the deadline has already elapsed', async () => {
  jest.useFakeTimers();
  let release: (value: Location.LocationPermissionResponse) => void = () => undefined;
  jest.mocked(Location.getForegroundPermissionsAsync).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const pending = requestLocationService.captureOnce();
  await jest.advanceTimersByTimeAsync(12_000);
  expect(await pending).toMatchObject({ available: false });
  release(permission(true));
  await jest.advanceTimersByTimeAsync(0);
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test('old, invalid or imprecise fixes are rejected rather than sent as current', () => {
  const now = Date.now();
  expect(pointFromFix(fix({ timestamp: now - 61_000 }), now, now)).toBeNull();
  expect(pointFromFix(fix({ timestamp: now + 6_000 }), now, now)).toBeNull();
  for (const coords of [{ latitude: NaN }, { latitude: 91 }, { longitude: 181 }, { accuracy: null }, { accuracy: -1 }, { accuracy: Infinity }]) {
    expect(pointFromFix(fix({ coords: { ...fix().coords, ...coords } }), now, now)).toBeNull();
  }
});

test('only the request body receives the snapshot; unavailable location is omitted', async () => {
  const post = jest.spyOn(apiClient, 'post').mockResolvedValue({ accessLogId: 'request', status: 'PENDING', expiresAt: '', locationShared: false });
  await accessApiService.requestAccess('item');
  expect(JSON.stringify(post.mock.calls[0][1])).toBe('{"vaultItemId":"item"}');
  const location = { latitude: 0, longitude: 0, accuracy: 80, capturedAt: new Date().toISOString() };
  await accessApiService.requestAccess('item', undefined, location);
  expect(post).toHaveBeenLastCalledWith('/access/request', { vaultItemId: 'item', deviceInfo: undefined, location });
  await accessApiService.requestAccess('item', undefined, location, true);
  expect(post).toHaveBeenLastCalledWith('/access/request', { vaultItemId: 'item', deviceInfo: undefined, location, retainLocationInHistory: true });
  await accessApiService.requestAccess('item', undefined, undefined, true);
  expect(JSON.stringify(post.mock.calls[post.mock.calls.length - 1][1])).toBe('{"vaultItemId":"item"}');
});
