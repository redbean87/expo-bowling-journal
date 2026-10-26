import {
  buildFramesPayload,
  findFirstFrameError,
  type FrameDraft,
} from './game-editor-frame-utils';

import type { EditableFrameInput } from '@/services/journal';

type AutosaveGuardInput = {
  localMode: boolean;
  isAuthenticated: boolean;
  hasSignedInBefore?: boolean;
  date: string;
  frameDrafts: FrameDraft[];
  isCreateMode: boolean;
  currentGameId: string | null;
};

type AutosaveBlocked = {
  status: 'blocked';
  message: string;
};

type AutosaveIdle = {
  status: 'idle';
};

type AutosaveReady = {
  status: 'ready';
  trimmedDate: string;
  payloadFrames: EditableFrameInput[];
  signature: string;
};

export type AutosaveGuardResult =
  | AutosaveBlocked
  | AutosaveIdle
  | AutosaveReady;

export function hasAnyFrameValue(frameDrafts: FrameDraft[]): boolean {
  return frameDrafts.some(
    (frame) =>
      frame.roll1Mask !== null ||
      frame.roll2Mask !== null ||
      frame.roll3Mask !== null
  );
}

export function buildAutosaveGuardResult({
  localMode,
  isAuthenticated,
  hasSignedInBefore = false,
  date,
  frameDrafts,
  isCreateMode,
  currentGameId,
}: AutosaveGuardInput): AutosaveGuardResult {
  // Local-first C-2 (T7): "sign in once online before using offline capture" was
  // a cloud-sync precondition — an unsent save had to be parked in the game-save
  // queue and could only drain after an account existed. Local mode has no such
  // dependency: a save is a SQLite write that needs no account and no network
  // (docs/local-first-architecture.md §1 "Normal bowling requires no sign-in"),
  // so a never-signed-in local bowler is not blocked here. The condition stays
  // for the non-local path, which still requires a session before it can sync;
  // nothing about authentication itself is touched — this guard only decides
  // whether the editor may autosave.
  if (!localMode && !isAuthenticated && !hasSignedInBefore) {
    return {
      status: 'blocked',
      message: 'Sign in once online before using offline capture.',
    };
  }

  const trimmedDate = date.trim();

  if (trimmedDate.length === 0) {
    return {
      status: 'blocked',
      message: 'Date is required to save.',
    };
  }

  const firstFrameError = findFirstFrameError(frameDrafts);

  if (firstFrameError) {
    return {
      status: 'blocked',
      message: firstFrameError.message,
    };
  }

  let payloadFrames: EditableFrameInput[];

  try {
    payloadFrames = buildFramesPayload(frameDrafts);
  } catch (caught) {
    return {
      status: 'blocked',
      message:
        caught instanceof Error ? caught.message : 'Unable to save game.',
    };
  }

  if (isCreateMode && !currentGameId && !hasAnyFrameValue(frameDrafts)) {
    return {
      status: 'idle',
    };
  }

  return {
    status: 'ready',
    trimmedDate,
    payloadFrames,
    signature: JSON.stringify({
      gameId: currentGameId ?? 'new',
      date: trimmedDate,
      frames: payloadFrames,
    }),
  };
}
