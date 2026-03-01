import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const HAS_SIGNED_IN_BEFORE_KEY = 'auth_has_signed_in_before';

function toNativeSecureStoreKey(key: string) {
  const safeKey = String(key ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return safeKey.length > 0 ? safeKey : '__default_key__';
}

async function getStorageItem(key: string) {
  if (Platform.OS === 'web') {
    return globalThis.localStorage.getItem(key);
  }

  const nativeKey = toNativeSecureStoreKey(key);
  try {
    return await SecureStore.getItemAsync(nativeKey);
  } catch {
    return null;
  }
}

async function setStorageItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value);
    return;
  }

  const nativeKey = toNativeSecureStoreKey(key);
  try {
    await SecureStore.setItemAsync(nativeKey, value);
  } catch {
    return;
  }
}

export async function loadHasSignedInBefore() {
  const value = await getStorageItem(HAS_SIGNED_IN_BEFORE_KEY);

  return value === '1';
}

export async function persistHasSignedInBefore() {
  await setStorageItem(HAS_SIGNED_IN_BEFORE_KEY, '1');
}
