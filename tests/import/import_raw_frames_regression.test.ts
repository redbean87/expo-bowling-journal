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
    'import_replace_all_cleanup.ts'
  );
  const validatorsPath = resolve(
    process.cwd(),
    'convex',
    'lib',
    'import_validators.ts'
  );
  const callbackHelpersPath = resolve(
    process.cwd(),
    'convex',
    'lib',
    'import_callback_helpers.ts'
  );
  const source = await readFile(importsPath, 'utf8');
  const cleanupSource = await readFile(cleanupPath, 'utf8');
  const validatorsSource = await readFile(validatorsPath, 'utf8');
  const callbackHelpersSource = await readFile(callbackHelpersPath, 'utf8');

  assert.equal(source.includes('persistRawImportChunkForBatch'), true);
  assert.equal(validatorsSource.includes("v.literal('importRawFrames')"), true);
  assert.equal(cleanupSource.includes(".query('importRawFrames')"), true);

  assert.equal(source.includes('persistCanonicalFrameChunkForCallback'), true);
  assert.equal(callbackHelpersSource.includes("ctx.db.insert('frames'"), true);
});
