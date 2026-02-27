import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createQueuedLeagueCreateEntry,
  createQueuedLeagueDeleteEntry,
  createQueuedLeagueUpdateEntry,
  createQueuedSessionCreateEntry,
  createQueuedSessionDeleteEntry,
  upsertQueuedJournalCreateEntry,
} from '../../src/screens/journal/journal-create-queue';

const BASE_TIME = 1_700_000_000_000;

test('upsert merges queued league update into queued league create', () => {
  const createEntry = createQueuedLeagueCreateEntry(
    {
      name: 'Tuesday Mixed',
      gamesPerSession: 3,
      houseId: null,
    },
    'league-client-1',
    BASE_TIME
  );

  const updateEntry = createQueuedLeagueUpdateEntry(
    {
      leagueClientSyncId: 'league-client-1',
      name: 'Tuesday Mixed - Updated',
      gamesPerSession: 4,
      houseId: null,
    },
    BASE_TIME + 10
  );

  const result = upsertQueuedJournalCreateEntry([createEntry], updateEntry);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.entityType, 'league-create');
  if (!result[0] || result[0].entityType !== 'league-create') {
    throw new Error('Expected merged league-create entry.');
  }
  assert.equal(result[0].payload.name, 'Tuesday Mixed - Updated');
  assert.equal(result[0].payload.gamesPerSession, 4);
});

test('upsert removes queued session create when queued session delete arrives', () => {
  const createEntry = createQueuedSessionCreateEntry(
    {
      leagueId: 'league-1' as never,
      date: '2026-02-26',
    },
    'session-client-1',
    null,
    BASE_TIME
  );

  const deleteEntry = createQueuedSessionDeleteEntry(
    { sessionClientSyncId: 'session-client-1' },
    BASE_TIME + 10
  );

  const result = upsertQueuedJournalCreateEntry([createEntry], deleteEntry);
  assert.deepEqual(result, []);
});

test('upsert keeps queued league delete over later queued league update', () => {
  const deleteEntry = createQueuedLeagueDeleteEntry(
    {
      leagueId: 'league-1' as never,
    },
    BASE_TIME
  );
  const updateEntry = createQueuedLeagueUpdateEntry(
    {
      leagueId: 'league-1' as never,
      name: 'Should not apply',
      gamesPerSession: 3,
      houseId: null,
    },
    BASE_TIME + 10
  );

  const result = upsertQueuedJournalCreateEntry([deleteEntry], updateEntry);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.entityType, 'league-delete');
});
