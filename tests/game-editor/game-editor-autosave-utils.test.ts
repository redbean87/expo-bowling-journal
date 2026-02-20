import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAutosaveGuardResult,
  hasAnyFrameValue,
} from '../../src/screens/game-editor/game-editor-autosave-utils';
import {
  EMPTY_FRAMES,
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

test('blocks autosave when user has never signed in', () => {
  const result = buildAutosaveGuardResult({
    isAuthenticated: false,
    hasSignedInBefore: false,
    date: '2026-02-12',
    frameDrafts: EMPTY_FRAMES,
    isCreateMode: true,
    currentGameId: null,
  });

  assert.deepEqual(result, {
    status: 'blocked',
    message: 'Sign in once online before using offline capture.',
  });
});

test('allows autosave when user signed in previously but is currently offline', () => {
  const frameDrafts = withFrame(0, {
    roll1Mask: 0x3ff,
  });

  const result = buildAutosaveGuardResult({
    isAuthenticated: false,
    hasSignedInBefore: true,
    date: '2026-02-12',
    frameDrafts,
    isCreateMode: true,
    currentGameId: null,
  });

  assert.equal(result.status, 'ready');
});

test('blocks autosave when date is empty', () => {
  const result = buildAutosaveGuardResult({
    isAuthenticated: true,
    date: '   ',
    frameDrafts: EMPTY_FRAMES,
    isCreateMode: true,
    currentGameId: null,
  });

  assert.deepEqual(result, {
    status: 'blocked',
    message: 'Date is required to save.',
  });
});

test('blocks autosave for invalid frame sums', () => {
  const frameDrafts = withFrame(0, {
    roll1Mask: 0b000011111111,
    roll2Mask: 0b000000001111,
  });

  const result = buildAutosaveGuardResult({
    isAuthenticated: true,
    date: '2026-02-12',
    frameDrafts,
    isCreateMode: true,
    currentGameId: null,
  });

  assert.deepEqual(result, {
    status: 'blocked',
    message: 'Frame 1: roll 2 can only knock standing pins.',
  });
});

test('stays idle in create mode with no game and no frame values', () => {
  const result = buildAutosaveGuardResult({
    isAuthenticated: true,
    date: '2026-02-12',
    frameDrafts: EMPTY_FRAMES,
    isCreateMode: true,
    currentGameId: null,
  });

  assert.deepEqual(result, {
    status: 'idle',
  });
});

test('becomes ready in create mode after first valid score input', () => {
  const frameDrafts = withFrame(0, {
    roll1Mask: 0x3ff,
  });

  const result = buildAutosaveGuardResult({
    isAuthenticated: true,
    date: '2026-02-12',
    frameDrafts,
    isCreateMode: true,
    currentGameId: null,
  });

  assert.equal(result.status, 'ready');

  if (result.status !== 'ready') {
    return;
  }

  assert.equal(result.trimmedDate, '2026-02-12');
  assert.deepEqual(result.payloadFrames, [
    {
      frameNumber: 1,
      roll1: 10,
      roll2: null,
      roll3: null,
      pins: result.payloadFrames[0]?.pins,
    },
  ]);
  assert.equal((result.payloadFrames[0]?.pins ?? 0) > 1073741823, true);
  assert.equal(
    result.signature,
    JSON.stringify({
      gameId: 'new',
      date: '2026-02-12',
      frames: result.payloadFrames,
    })
  );
});

test('remains ready in edit mode with existing game when frames are cleared', () => {
  const result = buildAutosaveGuardResult({
    isAuthenticated: true,
    date: '2026-02-12',
    frameDrafts: EMPTY_FRAMES,
    isCreateMode: false,
    currentGameId: 'game-123',
  });

  assert.equal(result.status, 'ready');

  if (result.status !== 'ready') {
    return;
  }

  assert.deepEqual(result.payloadFrames, []);
  assert.equal(
    result.signature,
    JSON.stringify({
      gameId: 'game-123',
      date: '2026-02-12',
      frames: [],
    })
  );
});

test('blocks autosave when frame order has gaps', () => {
  const frameDrafts = withFrame(1, {
    roll1Mask: 0b0000000111,
  });

  const result = buildAutosaveGuardResult({
    isAuthenticated: true,
    date: '2026-02-12',
    frameDrafts,
    isCreateMode: true,
    currentGameId: null,
  });

  assert.deepEqual(result, {
    status: 'blocked',
    message: 'Frames must be entered in order with no gaps.',
  });
});

test('detects any frame value in draft array', () => {
  assert.equal(hasAnyFrameValue(EMPTY_FRAMES), false);

  const frameDrafts = withFrame(9, {
    roll1Mask: 0b0000011111,
  });

  assert.equal(hasAnyFrameValue(frameDrafts), true);
});
