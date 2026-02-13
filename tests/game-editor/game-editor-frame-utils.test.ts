import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFramesPayload,
  EMPTY_FRAMES,
  getNextCursorAfterEntry,
  getStandingMaskForField,
  getVisibleRollFields,
  toFrameDrafts,
  type FrameDraft,
} from '../../src/screens/game-editor/game-editor-frame-utils';

function withFrame(
  frameIndex: number,
  frame: Partial<FrameDraft>,
  base: FrameDraft[] = EMPTY_FRAMES
) {
  const next = base.map((item) => ({ ...item }));
  next[frameIndex] = {
    ...next[frameIndex],
    ...frame,
  };

  return next;
}

test('buildFramesPayload maps pin masks to roll values', () => {
  const frameDrafts = withFrame(0, {
    roll1Mask: 0b0000001111,
    roll2Mask: 0b0000010000,
  });

  const payload = buildFramesPayload(frameDrafts);

  assert.equal(payload.length, 1);
  assert.deepEqual(payload[0], {
    frameNumber: 1,
    roll1: 4,
    roll2: 1,
    roll3: null,
    pins: payload[0]?.pins,
  });
  assert.equal((payload[0]?.pins ?? 0) > 1073741823, true);
});

test('prevents frame 1 roll 2 from knocking already down pins', () => {
  const frameDrafts = withFrame(0, {
    roll1Mask: 0b0000011111,
    roll2Mask: 0b0000001111,
  });

  assert.throws(() => buildFramesPayload(frameDrafts), {
    message: 'Frame 1: roll 2 can only knock standing pins.',
  });
});

test('hides roll 2 for strike in frames 1-9', () => {
  const frameDraft: FrameDraft = {
    roll1Mask: 0x3ff,
    roll2Mask: null,
    roll3Mask: null,
  };

  assert.deepEqual(getVisibleRollFields(0, frameDraft), ['roll1Mask']);
});

test('computes tenth frame roll 3 standing pins after strike + non-strike', () => {
  const frameDraft: FrameDraft = {
    roll1Mask: 0x3ff,
    roll2Mask: 0b0000000111,
    roll3Mask: null,
  };

  const standingMask = getStandingMaskForField(9, frameDraft, 'roll3Mask');

  assert.equal(standingMask & (frameDraft.roll2Mask ?? 0), 0);
});

test('next cursor advances to next frame after roll 2 in frames 1-9', () => {
  const frameDraft: FrameDraft = {
    roll1Mask: 0b0000000011,
    roll2Mask: 0b0000000100,
    roll3Mask: null,
  };

  assert.deepEqual(getNextCursorAfterEntry(0, 'roll2Mask', frameDraft), {
    frameIndex: 1,
    field: 'roll1Mask',
  });
});

test('toFrameDrafts restores manual packed pins when available', () => {
  const packedPins = 1073741824 | 0b11 | (0b100 << 10);
  const drafts = toFrameDrafts([
    {
      frameNumber: 1,
      roll1: 2,
      roll2: 1,
      roll3: null,
      pins: packedPins,
    },
  ]);

  assert.deepEqual(drafts[0], {
    roll1Mask: 0b11,
    roll2Mask: 0b100,
    roll3Mask: 0,
  });
});
