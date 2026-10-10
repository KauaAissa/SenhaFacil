import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export const textScales = [1, 1.2, 1.4] as const;
export type TextScale = typeof textScales[number];
const STORAGE_KEY = 'sf_accessibility_v1';
let writes = Promise.resolve();

interface AccessibilityState {
  textScale: TextScale;
  highContrast: boolean;
  hydrate: () => Promise<void>;
  setTextScale: (scale: TextScale) => Promise<void>;
  setHighContrast: (enabled: boolean) => Promise<void>;
}

function persist(): Promise<void> {
  const { textScale, highContrast } = useAccessibilityStore.getState();
  const value = JSON.stringify({ textScale, highContrast });
  writes = writes.catch(() => undefined).then(() => SecureStore.setItemAsync(STORAGE_KEY, value));
  return writes;
}

export const useAccessibilityStore = create<AccessibilityState>((set) => ({
  textScale: 1, highContrast: false,
  hydrate: async () => {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!stored) return;
      const value = JSON.parse(stored);
      set({ textScale: textScales.includes(value.textScale) ? value.textScale : 1, highContrast: value.highContrast === true });
    } catch {}
  },
  setTextScale: async (textScale) => {
    if (!textScales.includes(textScale)) throw new Error('INVALID_TEXT_SCALE');
    set({ textScale }); await persist();
  },
  setHighContrast: async (highContrast) => { set({ highContrast }); await persist(); },
}));