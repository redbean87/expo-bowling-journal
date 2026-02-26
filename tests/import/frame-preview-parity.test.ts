import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGameFramePreview } from '../../convex/lib/game_frame_preview';
import {
  getFrameSplitFlags,
  getFrameSymbolParts,
  toFrameDrafts,
} from '../../src/screens/game-editor/game-editor-frame-utils';

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
