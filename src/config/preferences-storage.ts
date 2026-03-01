import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SCOREBOARD_LAYOUT_KEY = 'prefs_scoreboard_layout';
const COLOR_MODE_PREFERENCE_KEY = 'prefs_color_mode_preference';
const THEME_FLAVOR_PREFERENCE_KEY = 'prefs_theme_flavor_preference';

export type ScoreboardLayoutMode = 'current' | 'compact';
export type ColorModePreference = 'system' | 'light' | 'dark';
export type ThemeFlavorPreference = 'default' | 'shinobi';

function toNativeSecureStoreKey(key: string) {
  const safeKey = String(key ?? '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return safeKey.length > 0 ? safeKey : '__default_key__';
}

function isScoreboardLayoutMode(value: string): value is ScoreboardLayoutMode {
  return value === 'current' || value === 'compact';
}

function isColorModePreference(value: string): value is ColorModePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isThemeFlavorPreference(
  value: string
): value is ThemeFlavorPreference {
  return value === 'default' || value === 'shinobi';
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

export async function loadScoreboardLayoutMode() {
  const value = await getStorageItem(SCOREBOARD_LAYOUT_KEY);

  if (!value || !isScoreboardLayoutMode(value)) {
    return 'current';
  }

  return value;
}

export async function persistScoreboardLayoutMode(mode: ScoreboardLayoutMode) {
  await setStorageItem(SCOREBOARD_LAYOUT_KEY, mode);
}

export async function loadColorModePreference() {
  const value = await getStorageItem(COLOR_MODE_PREFERENCE_KEY);

  if (!value || !isColorModePreference(value)) {
    return 'system';
  }

  return value;
}

export async function persistColorModePreference(mode: ColorModePreference) {
  await setStorageItem(COLOR_MODE_PREFERENCE_KEY, mode);
}

export async function loadThemeFlavorPreference() {
  const value = await getStorageItem(THEME_FLAVOR_PREFERENCE_KEY);

  if (!value || !isThemeFlavorPreference(value)) {
    return 'default';
  }

  return value;
}

export async function persistThemeFlavorPreference(
  flavor: ThemeFlavorPreference
) {
  await setStorageItem(THEME_FLAVOR_PREFERENCE_KEY, flavor);
}
