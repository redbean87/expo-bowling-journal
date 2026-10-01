/**
 * E1 — Local journal read adapter tests for the REAL SQLite-backed
 * `SqliteLocalJournalService` plus the app-boundary local read adapter
 * (`src/services/journal/local-reads`) and the shared service accessor
 * (`src/services/local-journal/accessor`).
 *
 * Like the C2–C5 tests, these drive the real `src/db/database.ts`
 * lifecycle (open/migrate/close) against `node:sqlite` via the
 * `expo-sqlite` stub remap (in-memory database by default). They cover:
 * the accessor singleton, and each adapter read mapped to the Convex
 * document shapes the read hooks consume — field mapping (including
 * derived game score aggregates from the C5 `getGameScore`), the documented
 * sentinel `userId`/open-session `leagueId` values, derived
 * `_creationTime` from stored dates, omission of `clientSyncId` and
 * `framePreview`, and the Convex-mimicking orderings (leagues by
 * `mostRecentSessionDate` descending with nulls last; sessions/games by
 * `date` descending with the local id order as tie-break).
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

const stubUrl = pathToFileURL(
  path.join(__dirname, '..', 'db', 'expo-sqlite-stub.mjs')
).href;

const hookHandle = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-sqlite') {
      return { url: stubUrl, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

after(() => {
  hookHandle.deregister();
});

type DatabaseModule = typeof import('../../src/db/database');
type DatabaseHandle = Awaited<ReturnType<DatabaseModule['getDatabase']>>;
type ServiceModule =
  typeof import('../../src/services/local-journal/sqlite-local-journal-service');
type Journal = InstanceType<ServiceModule['SqliteLocalJournalService']>;
type LocalReadsModule = typeof import('../../src/services/journal/local-reads');

import type {
  GameListItem,
  League,
  Session,
} from '../../src/services/journal/types/core';
import type {
  League as LocalLeague,
  Session as LocalSession,
  Game as LocalGame,
} from '../../src/services/local-journal/types';

async function loadDatabaseModule(): Promise<DatabaseModule> {
  return import('../../src/db/database');
}

/**
 * Close any open shared handle and return a fresh service instance over a
 * fresh in-memory database (the default stub behavior), plus the open
 * database handle for raw fixture inserts.
 */
async function freshJournal(): Promise<{
  journal: Journal;
  db: DatabaseHandle;
}> {
  const dbModule = await loadDatabaseModule();
  await dbModule.closeDatabase();
  const serviceModule =
    await import('../../src/services/local-journal/sqlite-local-journal-service');
  const db = await dbModule.getDatabase();
  return { journal: new serviceModule.SqliteLocalJournalService(), db };
}

/** Pin count -> mask: `count` pins down = the lowest `count` bits set. */
function toMask(count: number | null): number | null {
  if (count === null) {
    return null;
  }
  if (count === 0) {
    return 0;
  }
  return (1 << count) - 1;
}

const OPEN_SESSION_LEAGUE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Seed the shared in-memory journal with the fixture the adapter tests
 * assert against:
 * - `Zulu`: a league with no sessions (null `mostRecentSessionDate`).
 * - `Alpha`: a fully-populated league with three sessions (`a1`/`a2`/`a3`),
 *   the last holding two same-date games (`g1` fully populated, `g2`
 *   minimal).
 * - `Mid`: a league with one session dated after Alpha's newest session.
 * - `open`: an open (non-league) session with one game.
 */
async function seedFixture(): Promise<{
  journal: Journal;
  db: DatabaseHandle;
  zulu: LocalLeague;
  alpha: LocalLeague;
  mid: LocalLeague;
  a1: LocalSession;
  a2: LocalSession;
  a3: LocalSession;
  m1: LocalSession;
  g1: LocalGame;
  g2: LocalGame;
  open: LocalSession;
  og: LocalGame;
}> {
  const { journal, db } = await freshJournal();

  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-1',
    'Test House',
  ]);
  await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
    'ball-1',
    'Red Ball',
  ]);
  await db.runAsync('INSERT INTO patterns (id, name) VALUES (?, ?)', [
    'pattern-1',
    'Test Pattern',
  ]);

  const zulu = await journal.createLeague({ name: 'Zulu' });
  const alpha = await journal.createLeague({
    name: 'Alpha',
    gamesPerSession: 5,
    houseId: 'house-1',
    houseName: 'Test House',
    startDate: '2024-05-01',
    endDate: '2024-08-31',
  });
  const mid = await journal.createLeague({ name: 'Mid', gamesPerSession: 4 });

  const a1 = await journal.createSession({
    leagueId: alpha.id,
    date: '2024-05-01',
    weekNumber: 24,
    houseId: 'house-1',
    ballId: 'ball-1',
    patternId: 'pattern-1',
    notes: 'two nights',
    laneContext: {
      leftLane: 3,
      rightLane: 4,
      lanePair: '3/4',
      startingLane: 3,
    },
  });
  const a2 = await journal.createSession({
    leagueId: alpha.id,
    date: '2024-06-20',
  });
  const a3 = await journal.createSession({
    leagueId: alpha.id,
    date: '2024-07-15',
  });
  const m1 = await journal.createSession({
    leagueId: mid.id,
    date: '2024-08-01',
  });

  const g1 = await journal.createGame({
    sessionId: a3.id,
    date: '2024-07-15',
    ballId: 'ball-1',
    patternId: 'pattern-1',
    handicap: 3,
    notes: 'game one',
    laneContext: { leftLane: 2 },
    ballSwitches: [
      {
        frameNumber: 1,
        rollNumber: 2,
        ballId: 'ball-1',
        ballName: 'Red Ball',
        note: 'switched',
      },
      { frameNumber: 3 },
    ],
  });
  // Ten open frames of 7 + 2: total 90, 0 strikes, 0 spares, 10 opens.
  await journal.replaceGameFrames(
    g1.id,
    Array.from({ length: 10 }, (_, index) => ({
      frameNumber: index + 1,
      roll1Mask: toMask(7),
      roll2Mask: toMask(2),
    }))
  );

  const g2 = await journal.createGame({ sessionId: a3.id, date: '2024-07-15' });
  // Strike then nine open frames of 5 + 3: total 90, 1 strike, 0 spares,
  // 9 opens.
  await journal.replaceGameFrames(g2.id, [
    { frameNumber: 1, roll1Mask: toMask(10), roll2Mask: null },
    ...Array.from({ length: 9 }, (_, index) => ({
      frameNumber: index + 2,
      roll1Mask: toMask(5),
      roll2Mask: toMask(3),
    })),
  ]);

  const open = await journal.createSession({
    leagueId: null,
    date: '2024-06-30',
  });
  const og = await journal.createGame({
    sessionId: open.id,
    date: '2024-06-30',
  });
  await journal.replaceGameFrames(
    og.id,
    Array.from({ length: 10 }, (_, index) => ({
      frameNumber: index + 1,
      roll1Mask: toMask(7),
      roll2Mask: toMask(2),
    }))
  );

  return { journal, db, zulu, alpha, mid, a1, a2, a3, m1, g1, g2, open, og };
}

async function loadLocalReads(): Promise<LocalReadsModule> {
  return import('../../src/services/journal/local-reads');
}

test('getLocalJournalService returns one shared SqliteLocalJournalService instance', async () => {
  await freshJournal();
  const accessorModule = await import('../../src/services/local-journal');
  const serviceModule =
    await import('../../src/services/local-journal/sqlite-local-journal-service');

  const first = accessorModule.getLocalJournalService();
  const second = accessorModule.getLocalJournalService();

  assert.strictEqual(first, second);
  assert.ok(first instanceof serviceModule.SqliteLocalJournalService);
});

test('listLocalLeagues returns Convex-shaped league docs ordered by most recent session date (nulls last)', async () => {
  const fixture = await seedFixture();
  const reads = await loadLocalReads();

  const leagues: League[] = await reads.listLocalLeagues();

  // Recency order: Mid (2024-08-01), Alpha (2024-07-15), Zulu (no sessions).
  assert.deepEqual(
    leagues.map((league) => league._id),
    [fixture.mid.id, fixture.alpha.id, fixture.zulu.id]
  );

  const alphaDoc = leagues.find((league) => league._id === fixture.alpha.id);
  assert.ok(alphaDoc);
  assert.equal(alphaDoc._creationTime, 0);
  assert.equal(alphaDoc.userId, reads.LOCAL_JOURNAL_USER_ID);
  assert.equal(alphaDoc.createdAt, 0);
  assert.equal(alphaDoc.name, 'Alpha');
  assert.equal(alphaDoc.gamesPerSession, 5);
  assert.equal(alphaDoc.houseId, 'house-1');
  assert.equal(alphaDoc.houseName, 'Test House');
  assert.equal(alphaDoc.startDate, '2024-05-01');
  assert.equal(alphaDoc.endDate, '2024-08-31');
  assert.ok(!('clientSyncId' in alphaDoc));
  assert.ok(!('type' in alphaDoc));
  assert.ok(!('isOpenBowling' in alphaDoc));

  const zuluDoc = leagues.find((league) => league._id === fixture.zulu.id);
  assert.ok(zuluDoc);
  assert.equal(zuluDoc.name, 'Zulu');
  assert.equal(zuluDoc.gamesPerSession, null);
  assert.equal(zuluDoc.houseId, null);
  assert.equal(zuluDoc.houseName, null);
  assert.equal(zuluDoc.startDate, null);
  assert.equal(zuluDoc.endDate, null);
});

test('listLocalSessionsByLeague returns Convex-shaped session docs ordered newest-first', async () => {
  const fixture = await seedFixture();
  const reads = await loadLocalReads();

  const sessions: Session[] = await reads.listLocalSessionsByLeague(
    fixture.alpha.id
  );

  // Date descending: a3 (07-15), a2 (06-20), a1 (05-01).
  assert.deepEqual(
    sessions.map((session) => session._id),
    [fixture.a3.id, fixture.a2.id, fixture.a1.id]
  );

  const a1Doc = sessions[2];
  assert.ok(a1Doc);
  assert.equal(a1Doc._creationTime, Date.parse('2024-05-01T00:00:00Z'));
  assert.equal(a1Doc.userId, reads.LOCAL_JOURNAL_USER_ID);
  assert.equal(a1Doc.leagueId, fixture.alpha.id);
  assert.equal(a1Doc.date, '2024-05-01');
  assert.equal(a1Doc.weekNumber, 24);
  assert.equal(a1Doc.houseId, 'house-1');
  assert.equal(a1Doc.ballId, 'ball-1');
  assert.equal(a1Doc.patternId, 'pattern-1');
  assert.equal(a1Doc.notes, 'two nights');
  assert.deepEqual(a1Doc.laneContext, {
    leftLane: 3,
    rightLane: 4,
    lanePair: '3/4',
    startingLane: 3,
  });
  assert.ok(!('clientSyncId' in a1Doc));

  const a2Doc = sessions[1];
  assert.ok(a2Doc);
  assert.equal(a2Doc.weekNumber, null);
  assert.equal(a2Doc.houseId, null);
  assert.equal(a2Doc.ballId, null);
  assert.equal(a2Doc.patternId, null);
  // Unset optional local fields surface as explicit nulls (the local journal
  // stores NULL, not absent values); consumers read them with safe defaults.
  assert.equal(a2Doc.notes, null);
  assert.equal(a2Doc.laneContext, null);
  assert.ok(!('clientSyncId' in a2Doc));

  // Unknown league: empty list, no throw.
  assert.deepEqual(
    await reads.listLocalSessionsByLeague(OPEN_SESSION_LEAGUE_ID),
    []
  );
});

test('listLocalGamesBySession returns Convex-shaped game docs with C5-derived stats, ordered newest-first', async () => {
  const fixture = await seedFixture();
  const reads = await loadLocalReads();

  const games: GameListItem[] = await reads.listLocalGamesBySession(
    fixture.a3.id
  );

  // Both games share a date: the id-ascending tie-break decides the order.
  assert.deepEqual(
    games.map((game) => game._id),
    [fixture.g1.id, fixture.g2.id].sort()
  );

  const g1Doc = games.find((game) => game._id === fixture.g1.id);
  const g2Doc = games.find((game) => game._id === fixture.g2.id);
  assert.ok(g1Doc);
  assert.ok(g2Doc);

  assert.equal(g1Doc._creationTime, Date.parse('2024-07-15T00:00:00Z'));
  assert.equal(g1Doc.userId, reads.LOCAL_JOURNAL_USER_ID);
  assert.equal(g1Doc.sessionId, fixture.a3.id);
  assert.equal(g1Doc.leagueId, fixture.alpha.id);
  assert.equal(g1Doc.date, '2024-07-15');
  assert.equal(g1Doc.ballId, 'ball-1');
  assert.equal(g1Doc.patternId, 'pattern-1');
  assert.equal(g1Doc.handicap, 3);
  assert.equal(g1Doc.notes, 'game one');
  assert.deepEqual(g1Doc.laneContext, { leftLane: 2 });
  assert.deepEqual(g1Doc.ballSwitches, [
    {
      frameNumber: 1,
      rollNumber: 2,
      ballId: 'ball-1',
      ballName: 'Red Ball',
      note: 'switched',
    },
    { frameNumber: 3 },
  ]);
  assert.ok(!('framePreview' in g1Doc));
  assert.ok(!('clientSyncId' in g1Doc));

  // Hand-computed: ten open 7/2 frames.
  assert.equal(g1Doc.totalScore, 90);
  assert.equal(g1Doc.strikes, 0);
  assert.equal(g1Doc.spares, 0);
  assert.equal(g1Doc.opens, 10);

  // Hand-computed: strike + nine open 5/3 frames (18 + 9 * 8).
  assert.equal(g2Doc.totalScore, 90);
  assert.equal(g2Doc.strikes, 1);
  assert.equal(g2Doc.spares, 0);
  assert.equal(g2Doc.opens, 9);
  assert.equal(g2Doc.handicap, null);
  assert.equal(g2Doc.ballId, null);
  assert.equal(g2Doc.patternId, null);
  assert.equal(g2Doc.ballSwitches, null);
  // Unset optional local fields surface as explicit nulls (the local journal
  // stores NULL, not absent values); consumers read them with safe defaults.
  assert.equal(g2Doc.notes, null);
  assert.equal(g2Doc.laneContext, null);
  assert.ok(!('framePreview' in g2Doc));

  // The derived aggregates match the C5 service read exactly.
  const g1Score = await fixture.journal.getGameScore(fixture.g1.id);
  assert.ok(g1Score);
  assert.equal(g1Doc.totalScore, g1Score.totalScore);
  assert.equal(g1Doc.strikes, g1Score.strikes);
  assert.equal(g1Doc.spares, g1Score.spares);
  assert.equal(g1Doc.opens, g1Score.opens);
});

test('games under an open (non-league) session use the documented sentinel leagueId', async () => {
  const fixture = await seedFixture();
  const reads = await loadLocalReads();

  const games: GameListItem[] = await reads.listLocalGamesBySession(
    fixture.open.id
  );

  assert.equal(games.length, 1);
  const ogDoc = games[0];
  assert.ok(ogDoc);
  assert.equal(ogDoc.leagueId, reads.LOCAL_JOURNAL_OPEN_LEAGUE_ID);
  assert.equal(ogDoc.sessionId, fixture.open.id);
  assert.equal(ogDoc.date, '2024-06-30');
  assert.equal(ogDoc.totalScore, 90);
  assert.equal(ogDoc.opens, 10);
});

test('listLocalLeagueSummaries returns the home-league view shape in recency order', async () => {
  const fixture = await seedFixture();
  const reads = await loadLocalReads();

  const summaries = await reads.listLocalLeagueSummaries();

  assert.deepEqual(
    summaries.map((summary) => summary._id),
    [fixture.mid.id, fixture.alpha.id, fixture.zulu.id]
  );
  assert.equal(summaries[0]?.mostRecentSessionDate, '2024-08-01');
  assert.equal(summaries[0]?.name, 'Mid');
  assert.equal(summaries[0]?.gamesPerSession, 4);
  assert.equal(summaries[1]?.mostRecentSessionDate, '2024-07-15');
  assert.equal(summaries[1]?.name, 'Alpha');
  assert.equal(summaries[1]?.houseName, 'Test House');
  assert.equal(summaries[1]?.gamesPerSession, 5);

  const zuluSummary = summaries.find(
    (summary) => summary._id === fixture.zulu.id
  );
  assert.ok(zuluSummary);
  assert.equal(zuluSummary.mostRecentSessionDate, null);
  assert.equal(zuluSummary.houseName, null);
  assert.equal(zuluSummary.gamesPerSession, null);
});

test('local reads over an empty journal return empty lists', async () => {
  await freshJournal();
  const reads = await loadLocalReads();

  assert.deepEqual(await reads.listLocalLeagues(), []);
  assert.deepEqual(await reads.listLocalSessionsByLeague('some-league'), []);
  assert.deepEqual(await reads.listLocalGamesBySession('some-session'), []);
  assert.deepEqual(await reads.listLocalLeagueSummaries(), []);
});
