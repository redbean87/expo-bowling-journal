import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chunkRawFrameRows,
  DEFAULT_RAW_FRAME_CHUNK_SIZE,
} from '../../convex/lib/import_raw_frames';

test('chunkRawFrameRows splits large frame lists into bounded chunks', () => {
  const rows = Array.from({ length: 1_301 }, (_, index) => ({
    sqliteId: index + 1,
    gameFk: 1,
    frameNum: (index % 12) + 1,
  }));

  const chunks = chunkRawFrameRows(rows, 500);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 500);
  assert.equal(chunks[1].length, 500);
  assert.equal(chunks[2].length, 301);
});

test('chunkRawFrameRows honors default chunk size', () => {
  const rows = Array.from(
    { length: DEFAULT_RAW_FRAME_CHUNK_SIZE + 1 },
    (_, index) => ({
      sqliteId: index + 1,
    })
  );

  const chunks = chunkRawFrameRows(rows);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, DEFAULT_RAW_FRAME_CHUNK_SIZE);
  assert.equal(chunks[1].length, 1);
});

test('chunkRawFrameRows rejects invalid chunk size', () => {
  assert.throws(
    () => chunkRawFrameRows([], 0),
    /chunkSize must be a positive integer/
  );
});
