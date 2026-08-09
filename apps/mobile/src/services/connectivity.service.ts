import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

type ConnectivityListener = (isOnline: boolean) => void;

/**
 * Monitors network connectivity and notifies subscribers.
 *
 * Used throughout the app to decide between:
 *   - Online path  → call NestJS API, then update local SQLite cache
 *   - Offline path → read/write directly from local SQLite (offlineVaultService)
 *
 * Usage:
 *   // In app root (e.g., _layout.tsx)
 *   connectivityService.start();
 *
 *   // In a component or service
 *   const unsub = connectivityService.subscribe((online) => { ... });
 *   return () => unsub();
 */
class ConnectivityService {
  private _isOnline = true;
  private readonly listeners = new Set<ConnectivityListener>();
  private unsubscribeNetInfo: (() => void) | null = null;

  /** Begin listening for network state changes. Call once at app startup. */
  start(): void {
    this.unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable);
      if (online !== this._isOnline) {
        this._isOnline = online;
        this.listeners.forEach((cb) => cb(online));
      }
    });
  }

  /** Stop listening. Call on app unmount or cleanup. */
  stop(): void {
    this.unsubscribeNetInfo?.();
    this.unsubscribeNetInfo = null;
  }

  /** Current connectivity status. */
  get isOnline(): boolean {
    return this._isOnline;
  }

  /**
   * Subscribe to connectivity changes.
   * @returns Unsubscribe function — call it in useEffect cleanup.
   */
  subscribe(cb: ConnectivityListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * Returns a Promise that resolves when internet connectivity is restored.
   * Used to queue pending sync operations.
   *
   * @param timeoutMs - Max time to wait before rejecting with 'CONNECTIVITY_TIMEOUT'
   */
  waitForConnection(timeoutMs = 30_000): Promise<void> {
    if (this._isOnline) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('CONNECTIVITY_TIMEOUT'));
      }, timeoutMs);

      const cleanup = this.subscribe((online) => {
        if (online) {
          clearTimeout(timer);
          cleanup();
          resolve();
        }
      });
    });
  }
}

export const connectivityService = new ConnectivityService();
