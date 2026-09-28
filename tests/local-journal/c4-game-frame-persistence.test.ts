/**
 * C4 — Game/Frame persistence tests for the REAL SQLite-backed
 * `SqliteLocalJournalService`.
 *
 * Like the C2/C3 tests, these drive the real `src/db/database.ts`
 * lifecycle (open/migrate/close) against `node:sqlite` via the
 * `expo-sqlite` stub remap — with a file-backed database for the
 * cross-reopen persistence case — and exercise the C4 contract surface:
 * game create/read/update/delete, game filtering, frame replacement
 * (including the full canonical field round-trip that the current app's
 * replacement path historically dropped), ordered frame retrieval,
 * FK NO ACTION enforcement, replace atomicity, and the C4 recency
 * extension (game ball/pattern usage joins `listRecent*`; house usage
 * stays session-only).
 */
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { registerHooks } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

const SEAMS_KEY = '__bowlingJournalDbSeeds';
type Seams = Map<string, () => DatabaseSync>;

function setSeams(seams: Seams): void {
  (globalThis as unknown as Record<string, unknown>)[SEAMS_KEY] = seams;
}

function clearSeams(): void {
  const seams = (globalThis as unknown as Record<string, unknown>)[
    SEAMS_KEY
  ] as Seams | undefined;
  seams?.clear();
  (globalThis as unknown as Record<string, unknown>)[SEAMS_KEY] = undefined;
}

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/* -------------------------------------------------------------------------- */
/* Games                                                                       */
/* -------------------------------------------------------------------------- */

test('createGame persists every field and reads back via getGame and listGames', async () => {
  const { journal, db } = await freshJournal();
  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-1',
    'Test House',
  ]);
  await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
    'ball-1',
    'Test Ball',
  ]);
  await db.runAsync('INSERT INTO patterns (id, name) VALUES (?, ?)', [
    'pattern-1',
    'Test Pattern',
  ]);
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
    houseId: 'house-1',
    ballId: 'ball-1',
    patternId: 'pattern-1',
    handicap: 2,
    notes: 'played a good game',
    laneContext: {
      leftLane: 2,
      rightLane: 3,
      lanePair: '2/3',
      startingLane: 2,
    },
    ballSwitches: [
      {
        frameNumber: 6,
        ballId: 'ball-1',
        ballName: 'Test Ball',
        note: 'swapped',
      },
      { frameNumber: 10 },
    ],
  });

  const fetched = await journal.getGame(game.id);
  assert.deepEqual(fetched, {
    id: game.id,
    sessionId: session.id,
    date: '2024-06-02',
    houseId: 'house-1',
    ballId: 'ball-1',
    patternId: 'pattern-1',
    handicap: 2,
    notes: 'played a good game',
    laneContext: {
      leftLane: 2,
      rightLane: 3,
      lanePair: '2/3',
      startingLane: 2,
    },
    ballSwitches: [
      {
        frameNumber: 6,
        ballId: 'ball-1',
        ballName: 'Test Ball',
        note: 'swapped',
      },
      { frameNumber: 10 },
    ],
  });
  assert.match(game.id, UUID_PATTERN);

  const games = await journal.listGames();
  assert.equal(games.length, 1);
  assert.equal(games[0].id, game.id);
});

test('createGame with only session and date leaves optional fields null; unknown getGame is null', async () => {
  const { journal } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
  });
  const fetched = await journal.getGame(game.id);
  assert.deepEqual(fetched, {
    id: game.id,
    sessionId: session.id,
    date: '2024-06-02',
    houseId: null,
    ballId: null,
    patternId: null,
    handicap: null,
    notes: null,
    laneContext: null,
    ballSwitches: null,
  });
  assert.equal(await journal.getGame('no-such-game'), null);
});

test('createGame rejects a missing session (FK) and an invalid date without writing a game', async () => {
  const { journal, db } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });

  await assert.rejects(
    journal.createGame({ sessionId: 'no-such-session', date: '2024-06-02' }),
    /foreign key/i
  );
  await assert.rejects(
    journal.createGame({ sessionId: session.id, date: 'not-a-date' }),
    /invalid iso date/i
  );

  const { count } = (await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM games'
  ))!;
  assert.equal(count, 0);
  assert.deepEqual(await journal.listGames(), []);
});

test('updateGame sets provided fields, preserves omitted ones, and clears with null', async () => {
  const { journal, db } = await freshJournal();
  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-1',
    'Test House',
  ]);
  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-2',
    'Other House',
  ]);
  await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
    'ball-1',
    'Test Ball',
  ]);
  await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
    'ball-2',
    'Other Ball',
  ]);
  await db.runAsync('INSERT INTO patterns (id, name) VALUES (?, ?)', [
    'pattern-1',
    'Test Pattern',
  ]);
  await db.runAsync('INSERT INTO patterns (id, name) VALUES (?, ?)', [
    'pattern-2',
    'Other Pattern',
  ]);
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
    houseId: 'house-1',
    ballId: 'ball-1',
    patternId: 'pattern-1',
    handicap: 2,
    notes: 'original notes',
    laneContext: {
      leftLane: 1,
      rightLane: 2,
      lanePair: '1/2',
      startingLane: 2,
    },
    ballSwitches: [
      {
        frameNumber: 6,
        ballId: 'ball-1',
        ballName: 'Test Ball',
        note: 'swapped',
      },
    ],
  });

  // Date-only update: every other field preserved, including laneContext
  // and ballSwitches.
  const untouched = await journal.updateGame(game.id, { date: '2024-06-02' });
  assert.deepEqual(untouched, {
    id: game.id,
    sessionId: session.id,
    date: '2024-06-02',
    houseId: 'house-1',
    ballId: 'ball-1',
    patternId: 'pattern-1',
    handicap: 2,
    notes: 'original notes',
    laneContext: {
      leftLane: 1,
      rightLane: 2,
      lanePair: '1/2',
      startingLane: 2,
    },
    ballSwitches: [
      {
        frameNumber: 6,
        ballId: 'ball-1',
        ballName: 'Test Ball',
        note: 'swapped',
      },
    ],
  });

  // Full clear: every nullable field cleared with `null`.
  const cleared = await journal.updateGame(game.id, {
    date: '2024-06-02',
    houseId: null,
    ballId: null,
    patternId: null,
    handicap: null,
    notes: null,
    laneContext: null,
    ballSwitches: null,
  });
  assert.deepEqual(cleared, {
    id: game.id,
    sessionId: session.id,
    date: '2024-06-02',
    houseId: null,
    ballId: null,
    patternId: null,
    handicap: null,
    notes: null,
    laneContext: null,
    ballSwitches: null,
  });

  // Set new values, including an empty ballSwitches array (round-trips as
  // `[]`, not `null`).
  const set = await journal.updateGame(game.id, {
    date: '2024-06-05',
    houseId: 'house-2',
    ballId: 'ball-2',
    patternId: 'pattern-2',
    handicap: 5,
    notes: 'updated notes',
    laneContext: {
      leftLane: 3,
      rightLane: 4,
      lanePair: '3/4',
      startingLane: 3,
    },
    ballSwitches: [],
  });
  assert.deepEqual(set, {
    id: game.id,
    sessionId: session.id,
    date: '2024-06-05',
    houseId: 'house-2',
    ballId: 'ball-2',
    patternId: 'pattern-2',
    handicap: 5,
    notes: 'updated notes',
    laneContext: {
      leftLane: 3,
      rightLane: 4,
      lanePair: '3/4',
      startingLane: 3,
    },
    ballSwitches: [],
  });
});

test('updateGame rejects when the game does not exist', async () => {
  const { journal } = await freshJournal();
  await assert.rejects(
    journal.updateGame('no-such-game', { date: '2024-06-02' }),
    /not found/i
  );
});

test('removeGame deletes the game and is a no-op for unknown ids', async () => {
  const { journal } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
  });

  await journal.removeGame(game.id);
  assert.equal(await journal.getGame(game.id), null);
  assert.deepEqual(await journal.listGames(), []);

  // Idempotent: removing an already-removed (or unknown) game succeeds.
  await journal.removeGame(game.id);
  await journal.removeGame('no-such-game');
});

test('removeGame rejects while frames still reference the game (FK NO ACTION)', async () => {
  const { journal } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
  });
  await journal.replaceGameFrames(game.id, [{ frameNumber: 1, roll1Mask: 5 }]);

  await assert.rejects(journal.removeGame(game.id), /foreign key/i);
  assert.notEqual(await journal.getGame(game.id), null);
});

test('removeSession rejects while games still reference the session (FK NO ACTION)', async () => {
  const { journal } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  await journal.createGame({ sessionId: session.id, date: '2024-06-02' });

  await assert.rejects(journal.removeSession(session.id), /foreign key/i);
  assert.notEqual(await journal.getSession(session.id), null);
});

test('listGames filters by sessionId and leagueId and orders by date then id', async () => {
  const { journal } = await freshJournal();
  const leagueA = await journal.createLeague({ name: 'Alpha' });
  const leagueB = await journal.createLeague({ name: 'Beta' });
  const sessionA1 = await journal.createSession({
    leagueId: leagueA.id,
    date: '2024-01-10',
  });
  const sessionA2 = await journal.createSession({
    leagueId: leagueA.id,
    date: '2024-01-20',
  });
  const sessionB1 = await journal.createSession({
    leagueId: leagueB.id,
    date: '2024-01-15',
  });
  const sessionOpen = await journal.createSession({
    leagueId: null,
    date: '2024-01-05',
  });

  const gameA1 = await journal.createGame({
    sessionId: sessionA1.id,
    date: '2024-01-10',
  });
  const gameB1 = await journal.createGame({
    sessionId: sessionB1.id,
    date: '2024-01-15',
  });
  const gameA2a = await journal.createGame({
    sessionId: sessionA2.id,
    date: '2024-01-20',
  });
  const gameA2b = await journal.createGame({
    sessionId: sessionA2.id,
    date: '2024-01-20',
  });
  const gameOpen = await journal.createGame({
    sessionId: sessionOpen.id,
    date: '2024-01-05',
  });

  // No filter: every game, ordered by date then id.
  const all = await journal.listGames();
  assert.deepEqual(
    all.map((g) => g.id),
    [gameOpen.id, gameA1.id, gameB1.id, gameA2a.id, gameA2b.id]
      .slice()
      .sort((a, b) => {
        const da = all.find((g) => g.id === a)?.date ?? '';
        const db = all.find((g) => g.id === b)?.date ?? '';
        return da === db ? a.localeCompare(b) : da.localeCompare(db);
      })
  );

  // sessionId filter: only that session's games.
  const bySession = await journal.listGames({ sessionId: sessionA2.id });
  assert.equal(bySession.length, 2);
  const pair = bySession.map((g) => g.id);
  assert.deepEqual(pair, [...pair].sort());

  // leagueId filter: the games across the league's sessions (the canonical
  // session -> league hierarchy), excluding the other league and the open
  // session.
  const byLeague = await journal.listGames({ leagueId: leagueA.id });
  assert.deepEqual(
    byLeague.map((g) => g.id),
    [gameA1.id, gameA2a.id, gameA2b.id].slice().sort((a, b) => {
      const da = byLeague.find((g) => g.id === a)?.date ?? '';
      const db = byLeague.find((g) => g.id === b)?.date ?? '';
      return da === db ? a.localeCompare(b) : da.localeCompare(db);
    })
  );
  const byLeagueB = await journal.listGames({ leagueId: leagueB.id });
  assert.deepEqual(
    byLeagueB.map((g) => g.id),
    [gameB1.id]
  );
});

test('games persist across a closed and reopened connection', async () => {
  const dbFile = path.join(
    os.tmpdir(),
    `c4-journal-persistence-${process.pid}-${Date.now()}.db`
  );
  const seams: Seams = new Map();
  setSeams(seams);
  let dbModule: DatabaseModule | undefined;
  try {
    dbModule = await loadDatabaseModule();
    await dbModule.closeDatabase();
    const serviceModule =
      await import('../../src/services/local-journal/sqlite-local-journal-service');
    seams.set(dbModule.DATABASE_NAME, () => new DatabaseSync(dbFile));

    const journal = new serviceModule.SqliteLocalJournalService();
    await dbModule.getDatabase();
    const db = await dbModule.getDatabase();
    await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
      'house-1',
      'Test House',
    ]);
    const session = await journal.createSession({
      leagueId: null,
      date: '2024-06-01',
    });
    const game = await journal.createGame({
      sessionId: session.id,
      date: '2024-06-02',
      houseId: 'house-1',
      handicap: 3,
      notes: 'persistent game',
      laneContext: {
        leftLane: 5,
        rightLane: 6,
        lanePair: '5/6',
        startingLane: 6,
      },
      ballSwitches: [{ frameNumber: 7, note: 'switched' }],
    });

    // Close the shared handle (the stub's closeAsync really closes the
    // `DatabaseSync`), then re-open over the same file.
    await dbModule.closeDatabase();
    const reopened = new serviceModule.SqliteLocalJournalService();

    const fetched = await reopened.getGame(game.id);
    assert.deepEqual(fetched, {
      id: game.id,
      sessionId: session.id,
      date: '2024-06-02',
      houseId: 'house-1',
      ballId: null,
      patternId: null,
      handicap: 3,
      notes: 'persistent game',
      laneContext: {
        leftLane: 5,
        rightLane: 6,
        lanePair: '5/6',
        startingLane: 6,
      },
      ballSwitches: [{ frameNumber: 7, note: 'switched' }],
    });
    const games = await reopened.listGames();
    assert.equal(games.length, 1);
    assert.equal(games[0].id, game.id);
  } finally {
    if (dbModule) {
      await dbModule.closeDatabase();
    }
    clearSeams();
    rmSync(dbFile, { force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Game frames                                                                 */
/* -------------------------------------------------------------------------- */

test('getGameFrames returns an empty array for a game with no frames and for an unknown game', async () => {
  const { journal } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
  });
  assert.deepEqual(await journal.getGameFrames(game.id), []);
  assert.deepEqual(await journal.getGameFrames('no-such-game'), []);
});

test('replaceGameFrames creates the supplied frames and they are retrieved in frameNumber order', async () => {
  const { journal } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
  });

  // Supplied out of order; retrieval must be in bowling (frameNumber) order.
  await journal.replaceGameFrames(game.id, [
    { frameNumber: 5, roll1Mask: 9 },
    { frameNumber: 1, roll1Mask: 7 },
    { frameNumber: 3, roll1Mask: 4, roll2Mask: 5 },
  ]);

  const frames = await journal.getGameFrames(game.id);
  assert.equal(frames.length, 3);
  assert.deepEqual(
    frames.map((f) => f.frameNumber),
    [1, 3, 5]
  );
  for (const frame of frames) {
    assert.match(frame.id, UUID_PATTERN);
    assert.equal(frame.gameId, game.id);
  }
});

test('replaceGameFrames round-trips every canonical frame field', async () => {
  const { journal, db } = await freshJournal();
  await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
    'ball-1',
    'Test Ball',
  ]);
  await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
    'ball-2',
    'Other Ball',
  ]);
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
  });

  await journal.replaceGameFrames(game.id, [
    {
      frameNumber: 1,
      roll1Mask: 7,
      roll2Mask: 3,
      roll3Mask: null,
      ballId: 'ball-1',
      flags: 1,
      pocket: 2,
      footBoard: 1,
      targetBoard: 3,
    },
    {
      frameNumber: 2,
      roll1Mask: 0,
      roll2Mask: 0,
      roll3Mask: 0,
      ballId: null,
      flags: null,
      pocket: null,
      footBoard: null,
      targetBoard: null,
    },
    {
      frameNumber: 3,
      roll1Mask: 10,
      roll2Mask: null,
      roll3Mask: null,
      ballId: 'ball-2',
      flags: 2,
      pocket: 7,
      footBoard: 4,
      targetBoard: 2,
    },
  ]);

  const frames = await journal.getGameFrames(game.id);
  assert.equal(frames.length, 3);
  // Full canonical field round-trip: the current app's historical
  // replacement path persisted only frame number and roll pins, silently
  // dropping the roll masks, ball, and placement fields. Every canonical
  // field must survive.
  assert.deepEqual(frames, [
    {
      id: frames[0].id,
      gameId: game.id,
      frameNumber: 1,
      roll1Mask: 7,
      roll2Mask: 3,
      roll3Mask: null,
      ballId: 'ball-1',
      flags: 1,
      pocket: 2,
      footBoard: 1,
      targetBoard: 3,
    },
    {
      id: frames[1].id,
      gameId: game.id,
      frameNumber: 2,
      roll1Mask: 0,
      roll2Mask: 0,
      roll3Mask: 0,
      ballId: null,
      flags: null,
      pocket: null,
      footBoard: null,
      targetBoard: null,
    },
    {
      id: frames[2].id,
      gameId: game.id,
      frameNumber: 3,
      roll1Mask: 10,
      roll2Mask: null,
      roll3Mask: null,
      ballId: 'ball-2',
      flags: 2,
      pocket: 7,
      footBoard: 4,
      targetBoard: 2,
    },
  ]);
});

test('replaceGameFrames replaces the previous set (stale frames are removed)', async () => {
  const { journal, db } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
  });

  await journal.replaceGameFrames(game.id, [
    { frameNumber: 1, roll1Mask: 5 },
    { frameNumber: 2, roll1Mask: 6 },
    { frameNumber: 3, roll1Mask: 7 },
  ]);
  const previous = await journal.getGameFrames(game.id);
  const previousIds = previous.map((f) => f.id);

  await journal.replaceGameFrames(game.id, [
    { frameNumber: 1, roll1Mask: 8 },
    { frameNumber: 2, roll1Mask: 9 },
  ]);

  const current = await journal.getGameFrames(game.id);
  assert.equal(current.length, 2);
  assert.deepEqual(
    current.map((f) => f.frameNumber),
    [1, 2]
  );
  // The stale frame rows are gone, not just shadowed.
  for (const oldId of previousIds) {
    const { count } = (await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM frames WHERE id = ?',
      [oldId]
    ))!;
    assert.equal(count, 0);
  }
  const { count } = (await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM frames WHERE gameId = ?',
    [game.id]
  ))!;
  assert.equal(count, 2);
});

test('replaceGameFrames rejects for a missing game and changes nothing', async () => {
  const { journal, db } = await freshJournal();
  await assert.rejects(
    journal.replaceGameFrames('no-such-game', [
      { frameNumber: 1, roll1Mask: 5 },
    ]),
    /not found/i
  );
  const { count } = (await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM frames'
  ))!;
  assert.equal(count, 0);
  // No game is silently created either.
  assert.deepEqual(await journal.listGames(), []);
});

test('replaceGameFrames validates frameNumber before touching the database', async () => {
  const { journal } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
  });
  await journal.replaceGameFrames(game.id, [{ frameNumber: 1, roll1Mask: 5 }]);

  await assert.rejects(
    journal.replaceGameFrames(game.id, [
      { frameNumber: 1, roll1Mask: 5 },
      { frameNumber: NaN },
    ]),
    /frames\[1\]\.frameNumber/i
  );

  // The existing set is untouched (validation rejects before the
  // transaction opens).
  const frames = await journal.getGameFrames(game.id);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].roll1Mask, 5);
});

test('replaceGameFrames rolls back atomically when an insert fails mid-transaction', async () => {
  const { journal, db } = await freshJournal();
  await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
    'ball-1',
    'Test Ball',
  ]);
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2024-06-02',
  });
  await journal.replaceGameFrames(game.id, [
    { frameNumber: 1, roll1Mask: 5, ballId: 'ball-1' },
    { frameNumber: 2, roll1Mask: 6, ballId: 'ball-1' },
  ]);
  const snapshot = await journal.getGameFrames(game.id);

  // The second frame references a nonexistent ball: the FK fails mid-
  // transaction, the whole replacement (delete + inserts) rolls back, and
  // the previous frame set — same rows, same ids — is intact.
  await assert.rejects(
    journal.replaceGameFrames(game.id, [
      { frameNumber: 1, roll1Mask: 9, ballId: 'ball-1' },
      { frameNumber: 2, roll1Mask: 9, ballId: 'no-such-ball' },
    ]),
    /foreign key/i
  );

  const after = await journal.getGameFrames(game.id);
  assert.deepEqual(after, snapshot);
});

test('game frames persist across a closed and reopened connection', async () => {
  const dbFile = path.join(
    os.tmpdir(),
    `c4-frame-persistence-${process.pid}-${Date.now()}.db`
  );
  const seams: Seams = new Map();
  setSeams(seams);
  let dbModule: DatabaseModule | undefined;
  try {
    dbModule = await loadDatabaseModule();
    await dbModule.closeDatabase();
    const serviceModule =
      await import('../../src/services/local-journal/sqlite-local-journal-service');
    seams.set(dbModule.DATABASE_NAME, () => new DatabaseSync(dbFile));

    const journal = new serviceModule.SqliteLocalJournalService();
    const session = await journal.createSession({
      leagueId: null,
      date: '2024-06-01',
    });
    const game = await journal.createGame({
      sessionId: session.id,
      date: '2024-06-02',
    });
    await journal.replaceGameFrames(game.id, [
      {
        frameNumber: 1,
        roll1Mask: 7,
        roll2Mask: 3,
        ballId: null,
        flags: 1,
        pocket: 2,
        footBoard: 1,
        targetBoard: 3,
      },
      {
        frameNumber: 2,
        roll1Mask: 10,
        roll2Mask: null,
        roll3Mask: null,
        flags: null,
        pocket: null,
        footBoard: null,
        targetBoard: null,
      },
    ]);
    const before = await journal.getGameFrames(game.id);

    // Close the shared handle (the stub's closeAsync really closes the
    // `DatabaseSync`), then re-open over the same file.
    await dbModule.closeDatabase();
    const reopened = new serviceModule.SqliteLocalJournalService();

    assert.deepEqual(await reopened.getGameFrames(game.id), before);
    assert.equal((await reopened.getGame(game.id))?.sessionId, session.id);
  } finally {
    if (dbModule) {
      await dbModule.closeDatabase();
    }
    clearSeams();
    rmSync(dbFile, { force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Recency extension: game ball/pattern usage joins listRecent*                */
/* -------------------------------------------------------------------------- */

test('game ball/pattern usage joins listRecent*; house usage stays session-only', async () => {
  const { journal, db } = await freshJournal();
  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-session',
    'Session House',
  ]);
  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-game',
    'Game House',
  ]);
  await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
    'ball-session',
    'Session Ball',
  ]);
  await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
    'ball-game',
    'Game Ball',
  ]);
  await db.runAsync('INSERT INTO patterns (id, name) VALUES (?, ?)', [
    'pattern-session',
    'Session Pattern',
  ]);
  await db.runAsync('INSERT INTO patterns (id, name) VALUES (?, ?)', [
    'pattern-game',
    'Game Pattern',
  ]);

  // An older session establishes session-based usage for one of each.
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-01-01',
    houseId: 'house-session',
    ballId: 'ball-session',
    patternId: 'pattern-session',
  });
  // A newer game establishes game-based usage for the others. The game
  // carries its own houseId too — which must NOT contribute house usage,
  // because a game's house always comes through its session.
  await journal.createGame({
    sessionId: session.id,
    date: '2024-02-02',
    houseId: 'house-game',
    ballId: 'ball-game',
    patternId: 'pattern-game',
  });

  assert.deepEqual(await journal.listRecentBalls(), [
    { id: 'ball-game', name: 'Game Ball', brand: null, coverstock: null },
    { id: 'ball-session', name: 'Session Ball', brand: null, coverstock: null },
  ]);
  assert.deepEqual(await journal.listRecentPatterns(), [
    { id: 'pattern-game', name: 'Game Pattern', length: null },
    { id: 'pattern-session', name: 'Session Pattern', length: null },
  ]);
  // House recency is session-only: the game-referenced house is excluded.
  assert.deepEqual(await journal.listRecentHouses(), [
    { id: 'house-session', name: 'Session House', location: null },
  ]);
});

test('listRecent* preserves the cap and dedup with mixed session and game usage', async () => {
  const { journal, db } = await freshJournal();
  for (let i = 1; i <= 11; i += 1) {
    await db.runAsync('INSERT INTO balls (id, name) VALUES (?, ?)', [
      `ball-${i}`,
      `Ball ${i}`,
    ]);
  }
  // Four older sessions use ball-1..ball-4.
  for (let i = 1; i <= 4; i += 1) {
    await journal.createSession({
      leagueId: null,
      date: `2024-01-0${i}`,
      ballId: `ball-${i}`,
    });
  }
  // Six newer games use ball-5..ball-10 (ball-11 is unused entirely).
  for (let i = 5; i <= 10; i += 1) {
    const session = await journal.createSession({
      leagueId: null,
      date: `2024-02-0${i - 4}`,
    });
    await journal.createGame({
      sessionId: session.id,
      date: `2024-02-0${i - 4}`,
      ballId: `ball-${i}`,
    });
  }

  // Exactly the ten most recently used balls: the six game-referenced
  // balls (most recent usage) first, then the four session-referenced
  // balls. The unused ball-11 never appears, and the cap is exactly ten.
  const recent = await journal.listRecentBalls();
  assert.deepEqual(
    recent.map((b) => b.id),
    [
      'ball-10',
      'ball-9',
      'ball-8',
      'ball-7',
      'ball-6',
      'ball-5',
      'ball-4',
      'ball-3',
      'ball-2',
      'ball-1',
    ]
  );
});
