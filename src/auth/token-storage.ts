import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { TokenStorage } from '@convex-dev/auth/react';

export const tokenStorage: TokenStorage = {
  getItem: async (key) => {
    if (Platform.OS === 'web') {
      return globalThis.localStorage.getItem(key);
    }

    return SecureStore.getItemAsync(key);
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web') {
      globalThis.localStorage.setItem(key, value);
      return;
    }

    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key) => {
    if (Platform.OS === 'web') {
      globalThis.localStorage.removeItem(key);
      return;
    }

    await SecureStore.deleteItemAsync(key);
  },
};
