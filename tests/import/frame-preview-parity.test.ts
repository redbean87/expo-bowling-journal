import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGameFramePreview } from '../../convex/lib/game_frame_preview';
import {
  getFrameSplitFlags,
  getFrameSymbolParts,
  isOpenFrame,
  toFrameDrafts,
} from '../../src/screens/game-editor/game-editor-frame-utils';
import { normalizeFramePreviewItems } from '../../src/screens/journal/journal-games-display';

type PreviewFrame = {
  frameNumber: number;
  roll1: number;
  roll2?: number | null;
  roll3?: number | null;
  pins?: number | null;
};

function buildClientFramePreview(frames: PreviewFrame[]) {
  const frameDrafts = toFrameDrafts(frames);

  return frameDrafts.map((frameDraft, frameIndex) => {
    const symbolParts = getFrameSymbolParts(frameIndex, frameDraft);
    const splitFlags = getFrameSplitFlags(frameIndex, frameDraft);

    return {
      text: symbolParts.length > 0 ? symbolParts.join(' ') : '-',
      hasSplit: splitFlags.roll1 || splitFlags.roll2 || splitFlags.roll3,
      isOpen: isOpenFrame(frameIndex, frameDraft),
    };
  });
}

test('client and convex preview formatting stay aligned for mixed games', () => {
  const frames: PreviewFrame[] = [
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
  ];

  assert.deepEqual(
    buildClientFramePreview(frames),
    buildGameFramePreview(frames)
  );
});

test('client and convex split markers stay aligned when manual pins are present', () => {
  const frames: PreviewFrame[] = [
    {
      frameNumber: 1,
      roll1: 8,
      roll2: 2,
      roll3: null,
      pins: (1 << 30) | 447,
    },
    {
      frameNumber: 10,
      roll1: 10,
      roll2: 2,
      roll3: 8,
      pins: (1 << 30) | 0x3ff | (0x3f8 << 10) | (0x007 << 20),
    },
  ];

  assert.deepEqual(
    buildClientFramePreview(frames),
    buildGameFramePreview(frames)
  );
});

test('client and convex isOpen markers stay aligned for mixed open/non-open frames', () => {
  const frames: PreviewFrame[] = [
    { frameNumber: 1, roll1: 10, roll2: null, roll3: null },
    { frameNumber: 2, roll1: 9, roll2: 1, roll3: null },
    { frameNumber: 3, roll1: 7, roll2: 2, roll3: null },
    { frameNumber: 4, roll1: 0, roll2: 0, roll3: null },
    { frameNumber: 5, roll1: 8, roll2: 1, roll3: null },
    { frameNumber: 6, roll1: 10, roll2: null, roll3: null },
    { frameNumber: 7, roll1: 10, roll2: null, roll3: null },
    { frameNumber: 8, roll1: 9, roll2: 0, roll3: null },
    { frameNumber: 9, roll1: 6, roll2: 4, roll3: null },
    { frameNumber: 10, roll1: 7, roll2: 1, roll3: null },
  ];

  const client = buildClientFramePreview(frames);
  const server = buildGameFramePreview(frames);

  for (let i = 0; i < 10; i++) {
    assert.equal(
      client[i]?.isOpen,
      server[i]?.isOpen,
      `isOpen mismatch at frame ${String(i + 1)}`
    );
  }
});

test('normalizeFramePreviewItems defaults isOpen to false for old rows without isOpen field', () => {
  const oldRows = [
    { text: '7 2', hasSplit: false },
    { text: 'X', hasSplit: false },
  ];

  const result = normalizeFramePreviewItems(oldRows);

  assert.equal(result[0]?.isOpen, false);
  assert.equal(result[1]?.isOpen, false);
});

test('normalizeFramePreviewItems passes through isOpen when present', () => {
  const rows = [
    { text: '7 2', hasSplit: false, isOpen: true },
    { text: 'X', hasSplit: false, isOpen: false },
  ];

  const result = normalizeFramePreviewItems(rows);

  assert.equal(result[0]?.isOpen, true);
  assert.equal(result[1]?.isOpen, false);
});
