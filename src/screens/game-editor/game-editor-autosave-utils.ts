import {
  buildFramesPayload,
  findFirstFrameError,
  type FrameDraft,
} from './game-editor-frame-utils';

import type { EditableFrameInput } from '@/services/journal';

type AutosaveGuardInput = {
  isAuthenticated: boolean;
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
  isAuthenticated,
  date,
  frameDrafts,
  isCreateMode,
  currentGameId,
}: AutosaveGuardInput): AutosaveGuardResult {
  if (!isAuthenticated) {
    return {
      status: 'blocked',
      message: 'Sign in to auto-save changes.',
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
