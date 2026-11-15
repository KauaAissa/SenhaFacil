import type { AppStateStatus } from 'react-native';

let activePrompts = 0;
let applicationState: AppStateStatus = 'active';
const listeners = new Set<() => void>();
const foregroundWaiters = new Set<() => void>();

function waitForForeground(): Promise<void> {
  if (applicationState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      foregroundWaiters.delete(finish);
      resolve();
    };
    const timer = setTimeout(finish, 1_000);
    foregroundWaiters.add(finish);
  });
}

export const nativePromptService = {
  get isActive(): boolean { return activePrompts > 0; },
  handleAppStateChange(state: AppStateStatus): void {
    applicationState = state;
    if (state === 'active') [...foregroundWaiters].forEach((finish) => finish());
  },
  onSettled(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  async run<T>(operation: () => Promise<T>): Promise<T> {
    activePrompts += 1;
    try { return await operation(); }
    finally {
      // Android can resolve the native dialog before delivering its foreground event.
      await waitForForeground();
      activePrompts -= 1;
      if (activePrompts === 0) listeners.forEach((listener) => listener());
    }
  },
};
