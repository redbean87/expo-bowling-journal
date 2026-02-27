import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const JOURNAL_CLIENT_SYNC_MAP_STORAGE_KEY = 'journal:client-sync-map:v1';

export type JournalClientSyncMap = {
  leagues: Record<string, string>;
  sessions: Record<string, string>;
  houses: Record<string, string>;
  patterns: Record<string, string>;
  balls: Record<string, string>;
};

const EMPTY_MAP: JournalClientSyncMap = {
  leagues: {},
  sessions: {},
  houses: {},
  patterns: {},
  balls: {},
};

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.values(value).every((item) => typeof item === 'string');
}

async function getStoredValue() {
  if (Platform.OS === 'web') {
    return globalThis.localStorage.getItem(JOURNAL_CLIENT_SYNC_MAP_STORAGE_KEY);
  }

  return AsyncStorage.getItem(JOURNAL_CLIENT_SYNC_MAP_STORAGE_KEY);
}

async function setStoredValue(value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(JOURNAL_CLIENT_SYNC_MAP_STORAGE_KEY, value);
    return;
  }

  await AsyncStorage.setItem(JOURNAL_CLIENT_SYNC_MAP_STORAGE_KEY, value);
}

export async function loadJournalClientSyncMap(): Promise<JournalClientSyncMap> {
  try {
    const stored = await getStoredValue();

    if (!stored) {
      return EMPTY_MAP;
    }

    const parsed = JSON.parse(stored) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      return EMPTY_MAP;
    }

    const candidate = parsed as Partial<JournalClientSyncMap>;

    return {
      leagues: isStringRecord(candidate.leagues) ? candidate.leagues : {},
      sessions: isStringRecord(candidate.sessions) ? candidate.sessions : {},
      houses: isStringRecord(candidate.houses) ? candidate.houses : {},
      patterns: isStringRecord(candidate.patterns) ? candidate.patterns : {},
      balls: isStringRecord(candidate.balls) ? candidate.balls : {},
    };
  } catch {
    return EMPTY_MAP;
  }
}

export async function persistJournalClientSyncMap(map: JournalClientSyncMap) {
  await setStoredValue(JSON.stringify(map));
}

export async function upsertLeagueClientSyncMapping(
  clientSyncId: string,
  leagueId: string
) {
  const map = await loadJournalClientSyncMap();
  map.leagues[clientSyncId] = leagueId;
  await persistJournalClientSyncMap(map);
}

export async function upsertSessionClientSyncMapping(
  clientSyncId: string,
  sessionId: string
) {
  const map = await loadJournalClientSyncMap();
  map.sessions[clientSyncId] = sessionId;
  await persistJournalClientSyncMap(map);
}

export async function upsertHouseClientSyncMapping(
  clientSyncId: string,
  houseId: string
) {
  const map = await loadJournalClientSyncMap();
  map.houses[clientSyncId] = houseId;
  await persistJournalClientSyncMap(map);
}

export async function upsertPatternClientSyncMapping(
  clientSyncId: string,
  patternId: string
) {
  const map = await loadJournalClientSyncMap();
  map.patterns[clientSyncId] = patternId;
  await persistJournalClientSyncMap(map);
}

export async function upsertBallClientSyncMapping(
  clientSyncId: string,
  ballId: string
) {
  const map = await loadJournalClientSyncMap();
  map.balls[clientSyncId] = ballId;
  await persistJournalClientSyncMap(map);
}
