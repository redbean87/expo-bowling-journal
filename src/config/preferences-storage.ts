import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SCOREBOARD_LAYOUT_KEY = 'prefs:scoreboard-layout';

export type ScoreboardLayoutMode = 'current' | 'compact';

function isScoreboardLayoutMode(value: string): value is ScoreboardLayoutMode {
  return value === 'current' || value === 'compact';
}

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
