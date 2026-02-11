import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSnapshotJsonPayload } from '../../convex/lib/import_snapshot';

const MINIMAL_SNAPSHOT_JSON = JSON.stringify({
  houses: [],
  patterns: [],
  balls: [],
  leagues: [],
  weeks: [],
  games: [],
  frames: [],
});

test('parseSnapshotJsonPayload accepts valid payload', () => {
  const parsed = parseSnapshotJsonPayload(MINIMAL_SNAPSHOT_JSON);

  assert.deepEqual(parsed.houses, []);
  assert.deepEqual(parsed.frames, []);
});

test('parseSnapshotJsonPayload rejects invalid JSON payload', () => {
  assert.throws(
    () => parseSnapshotJsonPayload('{"houses":['),
    /Snapshot payload is not valid JSON/
  );
});

test('parseSnapshotJsonPayload rejects non-object payload', () => {
  assert.throws(
    () => parseSnapshotJsonPayload('[]'),
    /Snapshot payload field 'houses' must be an array/
  );
});

test('parseSnapshotJsonPayload rejects payload with missing array field', () => {
  const invalid = JSON.stringify({
    houses: [],
    patterns: [],
    balls: [],
    leagues: [],
    weeks: [],
    games: [],
    frames: null,
  });

  assert.throws(
    () => parseSnapshotJsonPayload(invalid),
    /Snapshot payload field 'frames' must be an array/
  );
});
