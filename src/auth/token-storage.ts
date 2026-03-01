import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TokenStorage } from '@convex-dev/auth/react';

function toNativeSecureStoreKey(key: string) {
  const safeKey = String(key ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return safeKey.length > 0 ? safeKey : '__default_key__';
}

export const tokenStorage: TokenStorage = {
  getItem: async (key) => {
    if (Platform.OS === 'web') {
      return globalThis.localStorage.getItem(key);
    }

    try {
      return await SecureStore.getItemAsync(toNativeSecureStoreKey(key));
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web') {
      globalThis.localStorage.setItem(key, value);
      return;
    }

    try {
      await SecureStore.setItemAsync(toNativeSecureStoreKey(key), value);
    } catch {
      return;
    }
  },
  removeItem: async (key) => {
    if (Platform.OS === 'web') {
      globalThis.localStorage.removeItem(key);
      return;
    }

    try {
      await SecureStore.deleteItemAsync(toNativeSecureStoreKey(key));
    } catch {
      return;
    }
  },
};
