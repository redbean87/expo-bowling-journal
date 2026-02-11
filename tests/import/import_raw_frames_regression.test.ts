import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('v1 import path does not persist importRawFrames rows', async () => {
  const importsPath = resolve(process.cwd(), 'convex', 'imports.ts');
  const source = await readFile(importsPath, 'utf8');

  assert.equal(source.includes("ctx.db.insert('importRawFrames'"), false);
  assert.equal(source.includes('ctx.db.insert("importRawFrames"'), false);
  assert.equal(source.includes(".query('importRawFrames')"), false);
  assert.equal(source.includes('.query("importRawFrames")'), false);
});
