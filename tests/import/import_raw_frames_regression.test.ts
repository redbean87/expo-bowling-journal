import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('callback import path persists importRawFrames rows', async () => {
  const importsPath = resolve(process.cwd(), 'convex', 'imports.ts');
  const source = await readFile(importsPath, 'utf8');

  assert.equal(source.includes('persistRawImportChunkForBatch'), true);
  assert.equal(source.includes("v.literal('importRawFrames')"), true);
  assert.equal(source.includes(".query('importRawFrames')"), true);

  assert.equal(source.includes('persistCanonicalFrameChunkForCallback'), true);
  assert.equal(source.includes("ctx.db.insert('frames'"), true);
});
