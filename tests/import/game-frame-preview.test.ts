import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGameFramePreview } from '../../convex/lib/game_frame_preview';

test('buildGameFramePreview returns ten placeholder frames when empty', () => {
  assert.deepEqual(buildGameFramePreview([]), [
    { text: '-', hasSplit: false, isOpen: false },
    { text: '-', hasSplit: false, isOpen: false },
    { text: '-', hasSplit: false, isOpen: false },
    { text: '-', hasSplit: false, isOpen: false },
    { text: '-', hasSplit: false, isOpen: false },
    { text: '-', hasSplit: false, isOpen: false },
    { text: '-', hasSplit: false, isOpen: false },
    { text: '-', hasSplit: false, isOpen: false },
    { text: '-', hasSplit: false, isOpen: false },
    { text: '-', hasSplit: false, isOpen: false },
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
    { text: 'X', hasSplit: false, isOpen: false },
    { text: '9 /', hasSplit: false, isOpen: false },
    { text: '7 2', hasSplit: false, isOpen: true },
    { text: '- -', hasSplit: false, isOpen: true },
    { text: '8 1', hasSplit: false, isOpen: true },
    { text: 'X', hasSplit: false, isOpen: false },
    { text: 'X', hasSplit: false, isOpen: false },
    { text: '9 -', hasSplit: false, isOpen: true },
    { text: '6 /', hasSplit: false, isOpen: false },
    { text: 'X 9 /', hasSplit: false, isOpen: false },
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

test('buildGameFramePreview marks isOpen true for open frames in frames 1-9', () => {
  const preview = buildGameFramePreview([
    { frameNumber: 1, roll1: 7, roll2: 1, roll3: null },
  ]);

  assert.equal(preview[0]?.isOpen, true);
  assert.equal(preview[0]?.hasSplit, false);
});

test('buildGameFramePreview marks isOpen false for a strike', () => {
  const preview = buildGameFramePreview([
    { frameNumber: 1, roll1: 10, roll2: null, roll3: null },
  ]);

  assert.equal(preview[0]?.isOpen, false);
});

test('buildGameFramePreview marks isOpen false for a spare', () => {
  const preview = buildGameFramePreview([
    { frameNumber: 1, roll1: 6, roll2: 4, roll3: null },
  ]);

  assert.equal(preview[0]?.isOpen, false);
});

test('buildGameFramePreview marks isOpen false for partial frame (only roll1)', () => {
  const preview = buildGameFramePreview([
    { frameNumber: 1, roll1: 5, roll2: null, roll3: null },
  ]);

  assert.equal(preview[0]?.isOpen, false);
});

test('buildGameFramePreview marks isOpen true for 10th frame open (7 + 1)', () => {
  const preview = buildGameFramePreview([
    { frameNumber: 10, roll1: 7, roll2: 1, roll3: null },
  ]);

  assert.equal(preview[9]?.isOpen, true);
});

test('buildGameFramePreview marks isOpen false for 10th frame strike on ball 1', () => {
  const preview = buildGameFramePreview([
    { frameNumber: 10, roll1: 10, roll2: 9, roll3: 1 },
  ]);

  assert.equal(preview[9]?.isOpen, false);
});
