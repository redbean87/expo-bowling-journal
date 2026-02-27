import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('sqlite export base/chunk paths share deterministic game mapping source', async () => {
  const exportsPath = resolve(process.cwd(), 'convex', 'exports.ts');
  const exportsSource = await readFile(exportsPath, 'utf8');

  assert.equal(
    exportsSource.includes('const exportContext = buildExportContext({'),
    true
  );
  assert.equal(
    exportsSource.includes('const sortedGames = exportContext.sortedGames'),
    true
  );
  assert.equal(
    exportsSource.includes(
      'const gameSqliteIdById = exportContext.gameSqliteIdById;'
    ),
    true
  );
  assert.equal(
    exportsSource.includes('exportContext.sortedGames.map(async (game) =>'),
    true
  );
});
