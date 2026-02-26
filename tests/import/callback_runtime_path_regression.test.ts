import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('callback importing path keeps snapshotJson transport and chunked raw/canonical frame persistence', async () => {
  const httpPath = resolve(process.cwd(), 'convex', 'http.ts');
  const processingPath = resolve(
    process.cwd(),
    'convex',
    'lib',
    'import_callback_processing.ts'
  );
  const httpSource = await readFile(httpPath, 'utf8');
  const processingSource = await readFile(processingPath, 'utf8');

  assert.equal(httpSource.includes('processImportCallbackPayload'), true);
  assert.equal(
    processingSource.includes('submitParsedSnapshotJsonForCallbackMutation'),
    true
  );
  assert.equal(
    processingSource.includes('snapshotJson: payload.snapshotJson as string'),
    true
  );
  assert.equal(
    processingSource.includes('deleteUserDocsChunkForImportMutation'),
    true
  );
  assert.equal(processingSource.includes('skipReplaceAllCleanup: true'), true);
  assert.equal(
    processingSource.includes('persistRawImportChunkForBatchMutation'),
    true
  );
  assert.equal(
    processingSource.includes('skipRawMirrorPersistence: true'),
    true
  );
  assert.equal(
    processingSource.includes('persistCanonicalFrameChunkForCallbackMutation'),
    true
  );
  assert.equal(
    processingSource.includes('completeSnapshotImportForCallbackMutation'),
    true
  );
});
