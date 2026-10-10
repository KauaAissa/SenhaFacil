import * as Clipboard from 'expo-clipboard';
import { SensitiveClipboardService } from '../src/services/clipboard.service';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });

test('sensitive clipboard expires after 30 seconds', async () => {
  const service = new SensitiveClipboardService();
  await service.copy('secret');
  expect(await Clipboard.getStringAsync()).toBe('secret');
  await jest.advanceTimersByTimeAsync(30_000);
  expect(await Clipboard.getStringAsync()).toBe('');
});

test('cleanup preserves content copied later by the user', async () => {
  const service = new SensitiveClipboardService();
  await service.copy('secret');
  await Clipboard.setStringAsync('user note');
  await service.clear();
  expect(await Clipboard.getStringAsync()).toBe('user note');
});

test('locking cancels a queued copy before it can expose plaintext', async () => {
  const service = new SensitiveClipboardService();
  await Clipboard.setStringAsync('user note');
  const copy = service.copy('secret');
  const clear = service.clear();
  await Promise.all([copy, clear]);
  expect(await Clipboard.getStringAsync()).toBe('user note');
});