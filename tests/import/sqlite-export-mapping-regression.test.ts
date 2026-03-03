import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

test('sqlite export uses single query with by_user frame scan and deterministic game mapping', async () => {
  const exportsPath = resolve(process.cwd(), 'convex', 'exports.ts');
  const exportsSource = await readFile(exportsPath, 'utf8');

  // Single exported query replaces the old two-query paginated approach
  assert.equal(
    exportsSource.includes('export const getSqliteBackupSnapshot = query('),
    true
  );

  // Frames are fetched in a single by_user scan rather than N+1 per game
  assert.equal(
    exportsSource.includes(
      ".withIndex('by_user', (q) => q.eq('userId', userId))"
    ),
    true
  );

  // Export context is built once and used for deterministic game mapping
  assert.equal(
    exportsSource.includes('const exportContext = buildExportContext({'),
    true
  );

  // Frame rows are assigned sqliteIds via a running counter (not per-chunk offset)
  assert.equal(exportsSource.includes('let sqliteIdCounter = 0'), true);
});
