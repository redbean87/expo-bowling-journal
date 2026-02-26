import { Platform } from 'react-native';

import {
  buildFramesPayload,
  type FrameDraft,
  type RollField,
} from './game-editor-frame-utils';

import type { GameId } from '@/services/journal';
export { createDraftNonce } from '@/utils/draft-nonce';

export function togglePinInMask(mask: number, pinNumber: number) {
  return mask ^ (1 << (pinNumber - 1));
}

export function setPinState(
  mask: number,
  pinNumber: number,
  shouldKnock: boolean
) {
  const pinBit = 1 << (pinNumber - 1);

  if (shouldKnock) {
    return mask | pinBit;
  }

  return mask & ~pinBit;
}

export function maskHasPin(mask: number, pinNumber: number) {
  return (mask & (1 << (pinNumber - 1))) !== 0;
}

export function buildSyncSignature(
  gameId: GameId | null,
  date: string,
  frameDrafts: FrameDraft[],
  patternId: string | null,
  ballId: string | null
) {
  return JSON.stringify({
    gameId,
    date: date.trim(),
    frameDrafts,
    patternId,
    ballId,
  });
}

export function buildPersistedSignature(
  gameId: GameId | null,
  date: string,
  frameDrafts: FrameDraft[],
  patternId: string | null,
  ballId: string | null
) {
  try {
    const payloadFrames = buildFramesPayload(frameDrafts);

    return JSON.stringify({
      gameId: gameId ?? 'new',
      date: date.trim(),
      frames: payloadFrames,
      patternId,
      ballId,
    });
  } catch {
    return null;
  }
}

export function hasAnyFrameDraftValue(frameDrafts: FrameDraft[]) {
  return frameDrafts.some(
    (frame) =>
      frame.roll1Mask !== null ||
      frame.roll2Mask !== null ||
      frame.roll3Mask !== null
  );
}

export function isOfflineLikely() {
  if (Platform.OS !== 'web') {
    return false;
  }

  if (typeof globalThis.navigator === 'undefined') {
    return false;
  }

  return globalThis.navigator.onLine === false;
}

export function getDefaultMaskForField(
  frameIndex: number,
  field: RollField,
  standingMask: number
) {
  if (field === 'roll1Mask') {
    return standingMask;
  }

  if (frameIndex === 9 && standingMask === 0x3ff) {
    return standingMask;
  }

  return 0;
}

export function clearDownstreamRolls(
  frame: FrameDraft,
  field: RollField
): FrameDraft {
  if (field === 'roll1Mask') {
    if (frame.roll2Mask === null && frame.roll3Mask === null) {
      return frame;
    }

    return {
      ...frame,
      roll2Mask: null,
      roll3Mask: null,
    };
  }

  if (field === 'roll2Mask') {
    if (frame.roll3Mask === null) {
      return frame;
    }

    return {
      ...frame,
      roll3Mask: null,
    };
  }

  return frame;
}
