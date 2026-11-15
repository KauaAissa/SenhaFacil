import { createContext } from 'react';
import type { ScrollView, TextInput } from 'react-native';

export const KeyboardFocusContext = createContext<(input: TextInput) => void>(() => undefined);
export const TabScreenContext = createContext(false);

export function isKeyboardScrollResponder(value: unknown): value is Pick<ScrollView, 'scrollResponderScrollNativeHandleToKeyboard'> {
  return typeof value === 'object' && value !== null && 'scrollResponderScrollNativeHandleToKeyboard' in value
    && typeof value.scrollResponderScrollNativeHandleToKeyboard === 'function';
}
