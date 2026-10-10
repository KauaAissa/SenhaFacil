import * as Clipboard from 'expo-clipboard';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

export class SensitiveClipboardService {
  private fingerprint: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private operations: Promise<void> = Promise.resolve();

  async copy(value: string): Promise<void> {
    const generation = ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    await this.enqueue(async () => {
      if (generation !== this.generation) return;
      const fingerprint = await digestStringAsync(CryptoDigestAlgorithm.SHA256, value);
      if (generation !== this.generation) return;
      await Clipboard.setStringAsync(value);
      this.fingerprint = fingerprint;
      if (generation === this.generation) this.timer = setTimeout(() => { void this.clear().catch(() => undefined); }, 30_000);
    });
  }

  async clear(): Promise<void> {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.enqueue(async () => {
      const fingerprint = this.fingerprint;
      this.fingerprint = null;
      if (!fingerprint) return;
      const current = await Clipboard.getStringAsync();
      if (await digestStringAsync(CryptoDigestAlgorithm.SHA256, current) === fingerprint) await Clipboard.setStringAsync('');
    });
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const pending = this.operations.catch(() => undefined).then(operation);
    this.operations = pending;
    await pending;
  }
}

export const sensitiveClipboard = new SensitiveClipboardService();