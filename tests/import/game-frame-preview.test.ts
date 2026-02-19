import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGameFramePreview } from '../../convex/lib/game_frame_preview';

test('buildGameFramePreview returns ten placeholder frames when empty', () => {
  assert.deepEqual(buildGameFramePreview([]), [
    { text: '-', hasSplit: false },
    { text: '-', hasSplit: false },
    { text: '-', hasSplit: false },
    { text: '-', hasSplit: false },
    { text: '-', hasSplit: false },
    { text: '-', hasSplit: false },
    { text: '-', hasSplit: false },
    { text: '-', hasSplit: false },
    { text: '-', hasSplit: false },
    { text: '-', hasSplit: false },
  ]);
});

test('buildGameFramePreview formats mixed normal frames and tenth bonus rolls', () => {
  const preview = buildGameFramePreview([
    { frameNumber: 1, roll1: 10, roll2: null, roll3: null },
    { frameNumber: 2, roll1: 9, roll2: 1, roll3: null },
    { frameNumber: 3, roll1: 7, roll2: 2, roll3: null },
    { frameNumber: 4, roll1: 0, roll2: 0, roll3: null },
    { frameNumber: 5, roll1: 8, roll2: 1, roll3: null },
    { frameNumber: 6, roll1: 10, roll2: null, roll3: null },
    { frameNumber: 7, roll1: 10, roll2: null, roll3: null },
    { frameNumber: 8, roll1: 9, roll2: 0, roll3: null },
    { frameNumber: 9, roll1: 6, roll2: 4, roll3: null },
    { frameNumber: 10, roll1: 10, roll2: 9, roll3: 1 },
  ]);

  assert.deepEqual(preview, [
    { text: 'X', hasSplit: false },
    { text: '9 /', hasSplit: false },
    { text: '7 2', hasSplit: false },
    { text: '- -', hasSplit: false },
    { text: '8 1', hasSplit: false },
    { text: 'X', hasSplit: false },
    { text: 'X', hasSplit: false },
    { text: '9 -', hasSplit: false },
    { text: '6 /', hasSplit: false },
    { text: 'X 9 /', hasSplit: false },
  ]);
});

test('buildGameFramePreview marks split frames when manual pins are available', () => {
  const preview = buildGameFramePreview([
    {
      frameNumber: 1,
      roll1: 8,
      roll2: 2,
      roll3: null,
      pins: (1 << 30) | 447,
    },
  ]);

  assert.equal(preview[0]?.hasSplit, true);
  assert.equal(preview[0]?.text, '8 /');
});
