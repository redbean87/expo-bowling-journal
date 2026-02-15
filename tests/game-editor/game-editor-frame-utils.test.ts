import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFramesPayload,
  EMPTY_FRAMES,
  getFrameSymbolParts,
  getFrameSymbolSummary,
  getSettledRunningTotals,
  getNextCursorAfterEntry,
  getStandingMaskForField,
  getVisibleRollFields,
  sanitizeFrameDraftsForEntry,
  toFrameDrafts,
  type FrameDraft,
} from '../../src/screens/game-editor/game-editor-frame-utils';

function toMask(count: number | null) {
  if (count === null) {
    return null;
  }

  if (count === 0) {
    return 0;
  }

  return (1 << count) - 1;
}

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

test('formats frame symbols for frames 1-9', () => {
  assert.equal(
    getFrameSymbolSummary(0, {
      roll1Mask: 0x3ff,
      roll2Mask: null,
      roll3Mask: null,
    }),
    'X'
  );

  assert.equal(
    getFrameSymbolSummary(0, {
      roll1Mask: 0b0001111111,
      roll2Mask: 0b1110000000,
      roll3Mask: null,
    }),
    '7/'
  );

  assert.equal(
    getFrameSymbolSummary(0, {
      roll1Mask: 0,
      roll2Mask: 0b0000001111,
      roll3Mask: null,
    }),
    '-4'
  );
});

test('returns separate roll parts so open frames are not ambiguous', () => {
  assert.deepEqual(
    getFrameSymbolParts(0, {
      roll1Mask: 0b0000000001,
      roll2Mask: 0b0000011110,
      roll3Mask: null,
    }),
    ['1', '4']
  );

  assert.deepEqual(
    getFrameSymbolParts(0, {
      roll1Mask: 0b0000000001,
      roll2Mask: 0b1111111110,
      roll3Mask: null,
    }),
    ['1', '/']
  );

  assert.deepEqual(
    getFrameSymbolParts(9, {
      roll1Mask: 0x3ff,
      roll2Mask: 0b0000000111,
      roll3Mask: 0b1111111000,
    }),
    ['X', '3', '/']
  );
});

test('formats frame symbols for tenth-frame strike and spare variants', () => {
  assert.equal(
    getFrameSymbolSummary(9, {
      roll1Mask: 0x3ff,
      roll2Mask: 0x3ff,
      roll3Mask: 0x3ff,
    }),
    'XXX'
  );

  assert.equal(
    getFrameSymbolSummary(9, {
      roll1Mask: 0x3ff,
      roll2Mask: 0b0001111111,
      roll3Mask: 0b1110000000,
    }),
    'X7/'
  );

  assert.equal(
    getFrameSymbolSummary(9, {
      roll1Mask: 0b0001111111,
      roll2Mask: 0b1110000000,
      roll3Mask: 0x3ff,
    }),
    '7/X'
  );
});

test('formats frame symbols for tenth-frame open and partial states', () => {
  assert.equal(
    getFrameSymbolSummary(9, {
      roll1Mask: 0,
      roll2Mask: 0b0000011111,
      roll3Mask: null,
    }),
    '-5'
  );

  assert.equal(
    getFrameSymbolSummary(9, {
      roll1Mask: 0b0000011111,
      roll2Mask: null,
      roll3Mask: null,
    }),
    '5'
  );
});

test('sanitizeFrameDraftsForEntry clears invalid roll3 outside frame 10', () => {
  const drafts = withFrame(0, {
    roll1Mask: 0b0000000111,
    roll2Mask: 0b0000001000,
    roll3Mask: 0b0000010000,
  });

  const result = sanitizeFrameDraftsForEntry(drafts);

  assert.equal(result.changed, true);
  assert.equal(result.drafts[0]?.roll3Mask, null);
  assert.equal(result.drafts[0]?.roll2Mask, 0b0000001000);
});

test('sanitizeFrameDraftsForEntry clears roll2 after strike outside frame 10', () => {
  const drafts = withFrame(1, {
    roll1Mask: 0x3ff,
    roll2Mask: 0b0000000001,
    roll3Mask: null,
  });

  const result = sanitizeFrameDraftsForEntry(drafts);

  assert.equal(result.changed, true);
  assert.equal(result.drafts[1]?.roll2Mask, null);
});

test('sanitizeFrameDraftsForEntry preserves frame 10 roll3', () => {
  const drafts = withFrame(9, {
    roll1Mask: 0x3ff,
    roll2Mask: 0x3ff,
    roll3Mask: 0b0000000011,
  });

  const result = sanitizeFrameDraftsForEntry(drafts);

  assert.equal(result.changed, false);
  assert.equal(result.drafts[9]?.roll3Mask, 0b0000000011);
});

test('getSettledRunningTotals returns cumulative totals for open frames', () => {
  const drafts = EMPTY_FRAMES.map((frame) => ({ ...frame }));
  drafts[0] = { roll1Mask: toMask(8), roll2Mask: toMask(1), roll3Mask: null };
  drafts[1] = { roll1Mask: toMask(3), roll2Mask: toMask(5), roll3Mask: null };

  assert.deepEqual(getSettledRunningTotals(drafts), [
    9,
    17,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
});

test('getSettledRunningTotals settles strike chains when bonus rolls exist', () => {
  const drafts = EMPTY_FRAMES.map((frame) => ({ ...frame }));
  drafts[0] = { roll1Mask: toMask(10), roll2Mask: null, roll3Mask: null };
  drafts[1] = { roll1Mask: toMask(10), roll2Mask: null, roll3Mask: null };
  drafts[2] = { roll1Mask: toMask(3), roll2Mask: toMask(4), roll3Mask: null };

  assert.deepEqual(getSettledRunningTotals(drafts), [
    23,
    40,
    47,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
});

test('getSettledRunningTotals settles spare with next roll and leaves partial frame blank', () => {
  const drafts = EMPTY_FRAMES.map((frame) => ({ ...frame }));
  drafts[0] = { roll1Mask: toMask(7), roll2Mask: toMask(3), roll3Mask: null };
  drafts[1] = { roll1Mask: toMask(4), roll2Mask: null, roll3Mask: null };

  assert.deepEqual(getSettledRunningTotals(drafts), [
    14,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
});

test('getSettledRunningTotals keeps tenth blank until bonus roll is entered', () => {
  const drafts = EMPTY_FRAMES.map((frame) => ({ ...frame }));

  for (let index = 0; index < 9; index += 1) {
    drafts[index] = {
      roll1Mask: toMask(0),
      roll2Mask: toMask(0),
      roll3Mask: null,
    };
  }

  drafts[9] = { roll1Mask: toMask(10), roll2Mask: toMask(10), roll3Mask: null };
  const withoutRoll3 = getSettledRunningTotals(drafts);

  assert.equal(withoutRoll3[9], null);

  drafts[9] = {
    roll1Mask: toMask(10),
    roll2Mask: toMask(10),
    roll3Mask: toMask(10),
  };
  const withRoll3 = getSettledRunningTotals(drafts);

  assert.equal(withRoll3[9], 30);
});
