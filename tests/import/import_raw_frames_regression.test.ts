import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('callback import path persists importRawFrames rows', async () => {
  const importsPath = resolve(process.cwd(), 'convex', 'imports.ts');
  const cleanupPath = resolve(
    process.cwd(),
    'convex',
    'lib',
    'import-replace-all-cleanup.ts'
  );
  const validatorsPath = resolve(
    process.cwd(),
    'convex',
    'lib',
    'import-validators.ts'
  );
  const source = await readFile(importsPath, 'utf8');
  const cleanupSource = await readFile(cleanupPath, 'utf8');
  const validatorsSource = await readFile(validatorsPath, 'utf8');

  assert.equal(source.includes('persistRawImportChunkForBatch'), true);
  assert.equal(validatorsSource.includes("v.literal('importRawFrames')"), true);
  assert.equal(cleanupSource.includes(".query('importRawFrames')"), true);

  assert.equal(source.includes('persistCanonicalFrameChunkForCallback'), true);
  assert.equal(source.includes("ctx.db.insert('frames'"), true);
});
