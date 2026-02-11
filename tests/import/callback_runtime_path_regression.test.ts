import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('callback importing path keeps snapshotJson transport and chunked frame persistence', async () => {
  const httpPath = resolve(process.cwd(), 'convex', 'http.ts');
  const source = await readFile(httpPath, 'utf8');

  assert.equal(
    source.includes('submitParsedSnapshotJsonForCallbackMutation'),
    true
  );
  assert.equal(
    source.includes('snapshotJson: payload.snapshotJson as string'),
    true
  );
  assert.equal(
    source.includes('persistCanonicalFrameChunkForCallbackMutation'),
    true
  );
  assert.equal(
    source.includes('completeSnapshotImportForCallbackMutation'),
    true
  );
});
