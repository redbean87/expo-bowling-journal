import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLeagueCreatedAtByEarliestWeekDate,
  dateStringToUtcTimestamp,
  normalizeImportDateStrict,
} from '../../convex/lib/import_dates';

test('normalizeImportDateStrict parses sqlite date formats without fallback', () => {
  assert.equal(
    normalizeImportDateStrict('2025-09-10T12:45:00.000Z'),
    '2025-09-10'
  );
  assert.equal(normalizeImportDateStrict(1_757_512_800), '2025-09-10');
  assert.equal(normalizeImportDateStrict(1_757_512_800_000), '2025-09-10');
  assert.equal(normalizeImportDateStrict('2025-9-1'), null);
  assert.equal(normalizeImportDateStrict(undefined), null);
});

test('buildLeagueCreatedAtByEarliestWeekDate chooses earliest valid week date per league', () => {
  const createdAtByLeague = buildLeagueCreatedAtByEarliestWeekDate([
    { leagueFk: 101, date: '2025-10-01' },
    { leagueFk: 101, date: '2025-09-10' },
    { leagueFk: 101, date: 'bad-date' },
    { leagueFk: 102, date: 1_757_512_800 },
    { leagueFk: 102, date: null },
    { leagueFk: null, date: '2025-09-01' },
  ]);

  assert.equal(
    createdAtByLeague.get(101),
    dateStringToUtcTimestamp('2025-09-10')
  );
  assert.equal(
    createdAtByLeague.get(102),
    dateStringToUtcTimestamp('2025-09-10')
  );
  assert.equal(createdAtByLeague.has(999), false);
});
