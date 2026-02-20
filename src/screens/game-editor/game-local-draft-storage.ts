import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { FrameDraft } from './game-editor-frame-utils';

const GAME_LOCAL_DRAFT_STORAGE_KEY = 'journal:game-local-draft:v1';

type StoredLocalDrafts = Record<string, LocalGameDraftEntry>;

export type LocalGameDraftEntry = {
  draftId: string;
  date: string;
  frameDrafts: FrameDraft[];
  patternId: string | null;
  ballId: string | null;
  signature: string;
  baseServerSignature: string | null;
  updatedAt: number;
};

function isFrameDraftArray(value: unknown): value is FrameDraft[] {
  return (
    Array.isArray(value) &&
    value.every(
      (candidate) =>
        candidate &&
        typeof candidate === 'object' &&
        (typeof (candidate as Partial<FrameDraft>).roll1Mask === 'number' ||
          (candidate as Partial<FrameDraft>).roll1Mask === null) &&
        (typeof (candidate as Partial<FrameDraft>).roll2Mask === 'number' ||
          (candidate as Partial<FrameDraft>).roll2Mask === null) &&
        (typeof (candidate as Partial<FrameDraft>).roll3Mask === 'number' ||
          (candidate as Partial<FrameDraft>).roll3Mask === null)
    )
  );
}

function isLocalGameDraftEntry(value: unknown): value is LocalGameDraftEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LocalGameDraftEntry>;

  return (
    typeof candidate.draftId === 'string' &&
    typeof candidate.date === 'string' &&
    isFrameDraftArray(candidate.frameDrafts) &&
    (typeof candidate.patternId === 'string' || candidate.patternId === null) &&
    (typeof candidate.ballId === 'string' || candidate.ballId === null) &&
    typeof candidate.signature === 'string' &&
    (typeof candidate.baseServerSignature === 'string' ||
      candidate.baseServerSignature === null) &&
    typeof candidate.updatedAt === 'number'
  );
}

async function getStoredValue() {
  if (Platform.OS === 'web') {
    return globalThis.localStorage.getItem(GAME_LOCAL_DRAFT_STORAGE_KEY);
  }

  return AsyncStorage.getItem(GAME_LOCAL_DRAFT_STORAGE_KEY);
}

async function setStoredValue(value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(GAME_LOCAL_DRAFT_STORAGE_KEY, value);
    return;
  }

  await AsyncStorage.setItem(GAME_LOCAL_DRAFT_STORAGE_KEY, value);
}

async function loadStoredLocalDrafts(): Promise<StoredLocalDrafts> {
  try {
    const stored = await getStoredValue();

    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry) => isLocalGameDraftEntry(entry[1]))
    );
  } catch {
    return {};
  }
}

export async function loadLocalGameDraft(draftId: string) {
  const entries = await loadStoredLocalDrafts();
  return entries[draftId] ?? null;
}

export async function upsertLocalGameDraft(entry: LocalGameDraftEntry) {
  const entries = await loadStoredLocalDrafts();
  entries[entry.draftId] = entry;
  await setStoredValue(JSON.stringify(entries));
}

export async function removeLocalGameDraft(draftId: string) {
  const entries = await loadStoredLocalDrafts();

  if (!entries[draftId]) {
    return;
  }

  delete entries[draftId];
  await setStoredValue(JSON.stringify(entries));
}
