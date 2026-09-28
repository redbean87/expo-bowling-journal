/**
 * C3 — Reference-data persistence tests for the REAL SQLite-backed
 * `SqliteLocalJournalService`.
 *
 * Like the A3/A5 DB tests and the C2 league/session tests, these drive the
 * real `src/db/database.ts` lifecycle (open/migrate/close) against
 * `node:sqlite` via the `expo-sqlite` stub remap — with a file-backed
 * database for the cross-reopen persistence case — and exercise the C3
 * contract surface: `createBall`/`createHouse`/`createPattern`,
 * `listBalls`/`listHouses`/`listPatterns`, and the `listRecent*`
 * operations (the local projection of the current app's reference recency
 * semantics: only entities used by at least one session, ordered by the
 * date of the most recent referencing session — session id descending as a
 * deterministic tie-break — deduplicated, capped at ten). Sessions are
 * created through the C2 `createSession` surface, which doubles as
 * C2-regression coverage.
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
 * database handle for raw fixture inspection.
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

/** Canonical local UUIDs are UUIDv4 strings. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertIsUuid(id: string): void {
  assert.match(id, UUID_PATTERN);
}

test('createBall persists every field and listBalls returns all balls deterministically ordered', async () => {
  const { journal, db } = await freshJournal();

  const storm = await journal.createBall({
    name: 'Storm',
    brand: 'Storm Products',
    coverstock: 'React',
  });
  const zulu = await journal.createBall({
    name: 'Zulu',
    brand: 'Zebra',
    coverstock: 'Solid',
  });
  const alpha = await journal.createBall({ name: 'alpha' });
  const alpha2 = await journal.createBall({ name: 'Alpha-2' });

  // Canonical local UUIDs.
  for (const ball of [storm, zulu, alpha, alpha2]) {
    assertIsUuid(ball.id);
  }

  // Absent optional fields persist as null.
  assert.deepEqual(alpha, {
    id: alpha.id,
    name: 'alpha',
    brand: null,
    coverstock: null,
  });

  // The `metadata` column has no C1 domain field for balls and is never
  // written to.
  const rawMetadata = await db.getFirstAsync<{ metadata: string | null }>(
    'SELECT metadata FROM balls WHERE id = ?',
    [storm.id]
  );
  assert.equal(rawMetadata?.metadata ?? null, null);

  // Multiple records, ordered by name (case-insensitive) then id.
  const balls = await journal.listBalls();
  assert.deepEqual(
    balls.map((ball) => ball.id),
    [alpha.id, alpha2.id, storm.id, zulu.id]
  );
  assert.deepEqual(
    balls.find((ball) => ball.id === storm.id),
    {
      id: storm.id,
      name: 'Storm',
      brand: 'Storm Products',
      coverstock: 'React',
    }
  );
});

test('createHouse persists every field and listHouses returns all houses deterministically ordered', async () => {
  const { journal } = await freshJournal();

  const lane8 = await journal.createHouse({
    name: 'Lane 8 Lanes',
    location: 'Boca Raton, FL',
  });
  const alley = await journal.createHouse({ name: 'alley' });
  const alleyB = await journal.createHouse({ name: 'Alley-B' });

  for (const house of [lane8, alley, alleyB]) {
    assertIsUuid(house.id);
  }

  // Absent optional fields persist as null.
  assert.deepEqual(alley, {
    id: alley.id,
    name: 'alley',
    location: null,
  });

  const houses = await journal.listHouses();
  assert.deepEqual(
    houses.map((house) => house.id),
    [alley.id, alleyB.id, lane8.id]
  );
  assert.deepEqual(
    houses.find((house) => house.id === lane8.id),
    {
      id: lane8.id,
      name: 'Lane 8 Lanes',
      location: 'Boca Raton, FL',
    }
  );
});

test('createPattern persists every field and listPatterns returns all patterns deterministically ordered', async () => {
  const { journal } = await freshJournal();

  const parallel = await journal.createPattern({
    name: 'Parallel',
    length: 3.5,
  });
  const unmarked = await journal.createPattern({ name: 'unmarked' });
  const unmarkedB = await journal.createPattern({
    name: 'Unmarked-B',
    length: 4,
  });

  for (const pattern of [parallel, unmarked, unmarkedB]) {
    assertIsUuid(pattern.id);
  }

  // Absent optional fields persist as null.
  assert.deepEqual(unmarked, {
    id: unmarked.id,
    name: 'unmarked',
    length: null,
  });

  const patterns = await journal.listPatterns();
  assert.deepEqual(
    patterns.map((pattern) => pattern.id),
    [parallel.id, unmarked.id, unmarkedB.id]
  );
  assert.deepEqual(
    patterns.find((pattern) => pattern.id === parallel.id),
    {
      id: parallel.id,
      name: 'Parallel',
      length: 3.5,
    }
  );
});

test('listRecentBalls lists only used balls, most recently used first, deduplicated', async () => {
  const { journal } = await freshJournal();

  const neverUsed = await journal.createBall({ name: 'Never Used' });
  const a = await journal.createBall({ name: 'A' });
  const b = await journal.createBall({ name: 'B' });
  const c = await journal.createBall({ name: 'C' });

  // No sessions yet: nothing has been used, even though balls exist.
  assert.deepEqual(await journal.listRecentBalls(), []);

  await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
    ballId: a.id,
  });
  await journal.createSession({
    leagueId: null,
    date: '2024-06-15',
    ballId: b.id,
  });
  // Reuse of `a`: its most recent occurrence (2024-06-10) wins.
  await journal.createSession({
    leagueId: null,
    date: '2024-06-10',
    ballId: a.id,
  });
  await journal.createSession({
    leagueId: null,
    date: '2024-06-20',
    ballId: c.id,
  });

  // C, then B, then A — never-used excluded, reused ball deduplicated.
  const recent = await journal.listRecentBalls();
  assert.deepEqual(
    recent.map((ball) => ball.id),
    [c.id, b.id, a.id]
  );
  assert.deepEqual(recent[0], {
    id: c.id,
    name: 'C',
    brand: null,
    coverstock: null,
  });

  const all = await journal.listBalls();
  assert.ok(all.some((ball) => ball.id === neverUsed.id));
  assert.ok(!recent.some((ball) => ball.id === neverUsed.id));
});

test('listRecentHouses lists only used houses, most recently used first', async () => {
  const { journal } = await freshJournal();

  const home = await journal.createHouse({ name: 'Home' });
  const away = await journal.createHouse({ name: 'Away' });

  // No sessions yet: nothing has been used.
  assert.deepEqual(await journal.listRecentHouses(), []);

  await journal.createSession({
    leagueId: null,
    date: '2024-05-05',
    houseId: home.id,
  });
  await journal.createSession({
    leagueId: null,
    date: '2024-05-06',
    houseId: away.id,
  });
  // Reuse of `home` on a later date moves it to the front again.
  await journal.createSession({
    leagueId: null,
    date: '2024-05-07',
    houseId: home.id,
  });

  const recent = await journal.listRecentHouses();
  assert.deepEqual(
    recent.map((house) => house.id),
    [home.id, away.id]
  );
});

test('listRecentPatterns lists only used patterns, most recently used first', async () => {
  const { journal } = await freshJournal();

  const parallel = await journal.createPattern({ name: 'Parallel' });
  const unmarked = await journal.createPattern({ name: 'Unmarked' });

  // No sessions yet: nothing has been used.
  assert.deepEqual(await journal.listRecentPatterns(), []);

  await journal.createSession({
    leagueId: null,
    date: '2024-04-01',
    patternId: unmarked.id,
  });
  await journal.createSession({
    leagueId: null,
    date: '2024-04-02',
    patternId: parallel.id,
  });
  // Reuse of `unmarked` on a later date moves it to the front again.
  await journal.createSession({
    leagueId: null,
    date: '2024-04-03',
    patternId: unmarked.id,
  });

  const recent = await journal.listRecentPatterns();
  assert.deepEqual(
    recent.map((pattern) => pattern.id),
    [unmarked.id, parallel.id]
  );
});

test('listRecentBalls caps at the ten most recently used balls', async () => {
  const { journal } = await freshJournal();

  const balls = [];
  for (let i = 1; i <= 12; i++) {
    balls.push(await journal.createBall({ name: `Ball ${i}` }));
  }

  // One session per ball, dates ascending: recency is Ball 12 down to Ball 1.
  for (let i = 1; i <= 12; i++) {
    await journal.createSession({
      leagueId: null,
      date: `2024-06-${String(i).padStart(2, '0')}`,
      ballId: balls[i - 1].id,
    });
  }

  const recent = await journal.listRecentBalls();
  assert.equal(recent.length, 10);
  assert.deepEqual(
    recent.map((ball) => ball.name),
    [
      'Ball 12',
      'Ball 11',
      'Ball 10',
      'Ball 9',
      'Ball 8',
      'Ball 7',
      'Ball 6',
      'Ball 5',
      'Ball 4',
      'Ball 3',
    ]
  );
});

test('listRecentBalls breaks same-date ties deterministically by session id', async () => {
  const { journal } = await freshJournal();

  const a = await journal.createBall({ name: 'A' });
  const b = await journal.createBall({ name: 'B' });

  const s1 = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
    ballId: a.id,
  });
  const s2 = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
    ballId: b.id,
  });

  const [newer, older] = [s1, s2].sort((x, y) => y.id.localeCompare(x.id));
  assert.deepEqual(
    (await journal.listRecentBalls()).map((ball) => ball.id),
    [newer.ballId, older.ballId]
  );
});

test('reference data and session recency persist across a closed and reopened connection', async () => {
  const dbFile = path.join(
    os.tmpdir(),
    `c3-journal-persistence-${process.pid}-${Date.now()}.db`
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
    const ball = await journal.createBall({
      name: 'Storm',
      brand: 'Storm Products',
      coverstock: 'React',
    });
    const unusedBall = await journal.createBall({ name: 'Unused Ball' });
    const house = await journal.createHouse({
      name: 'Lane 8 Lanes',
      location: 'Boca Raton, FL',
    });
    const pattern = await journal.createPattern({
      name: 'Parallel',
      length: 3.5,
    });

    await journal.createSession({
      leagueId: null,
      date: '2024-03-01',
      ballId: unusedBall.id,
      houseId: house.id,
    });
    await journal.createSession({
      leagueId: null,
      date: '2024-03-02',
      ballId: ball.id,
      houseId: house.id,
      patternId: pattern.id,
    });

    // Close the shared handle (the stub's closeAsync really closes the
    // `DatabaseSync`), then re-open over the same file.
    await dbModule.closeDatabase();
    const reopened = new serviceModule.SqliteLocalJournalService();

    // Case-insensitive name order: 'Storm' before 'Unused Ball'.
    const balls = await reopened.listBalls();
    assert.deepEqual(
      balls.map((b) => b.id),
      [ball.id, unusedBall.id]
    );
    assert.deepEqual(
      balls.find((b) => b.id === ball.id),
      {
        id: ball.id,
        name: 'Storm',
        brand: 'Storm Products',
        coverstock: 'React',
      }
    );

    const houses = await reopened.listHouses();
    assert.deepEqual(houses, [
      { id: house.id, name: 'Lane 8 Lanes', location: 'Boca Raton, FL' },
    ]);

    const patterns = await reopened.listPatterns();
    assert.deepEqual(patterns, [
      { id: pattern.id, name: 'Parallel', length: 3.5 },
    ]);

    // Recency survives the reopen: the 2024-03-02 session is the most
    // recent for the ball/house/pattern; the unused ball's only session is
    // 2024-03-01.
    assert.deepEqual(
      (await reopened.listRecentBalls()).map((b) => b.id),
      [ball.id, unusedBall.id]
    );
    assert.deepEqual(
      (await reopened.listRecentHouses()).map((h) => h.id),
      [house.id]
    );
    assert.deepEqual(
      (await reopened.listRecentPatterns()).map((p) => p.id),
      [pattern.id]
    );
  } finally {
    if (dbModule) {
      await dbModule.closeDatabase();
    }
    clearSeams();
    rmSync(dbFile, { force: true });
  }
});
