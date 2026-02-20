import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const HAS_SIGNED_IN_BEFORE_KEY = 'auth:has-signed-in-before';

async function getStorageItem(key: string) {
  if (Platform.OS === 'web') {
    return globalThis.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function setStorageItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function loadHasSignedInBefore() {
  const value = await getStorageItem(HAS_SIGNED_IN_BEFORE_KEY);

  return value === '1';
}

export async function persistHasSignedInBefore() {
  await setStorageItem(HAS_SIGNED_IN_BEFORE_KEY, '1');
}
