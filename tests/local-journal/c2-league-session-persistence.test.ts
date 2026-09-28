/**
 * C2 — League/Session persistence tests for the REAL SQLite-backed
 * `SqliteLocalJournalService`.
 *
 * Like the A3/A5 DB tests, these drive the real `src/db/database.ts`
 * lifecycle (open/migrate/close) against `node:sqlite` via the
 * `expo-sqlite` stub remap — with a file-backed database for the
 * cross-reopen persistence case — and exercise the C2 contract surface:
 * create/read/update/delete for leagues and sessions, open sessions
 * (`leagueId = null`), league filtering, `listLeagueSummaries()` derived
 * dates, FK NO ACTION enforcement, and persistence across a reopened
 * connection.
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

test('createLeague persists every field and reads back via getLeague and listLeagues', async () => {
  const { journal, db } = await freshJournal();
  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-1',
    'Test House',
  ]);
  const league = await journal.createLeague({
    name: 'Home League',
    gamesPerSession: 5,
    houseId: 'house-1',
    houseName: 'Test House',
    startDate: '2024-03-01',
    endDate: '2024-07-15',
  });

  const fetched = await journal.getLeague(league.id);
  assert.deepEqual(fetched, {
    id: league.id,
    name: 'Home League',
    gamesPerSession: 5,
    houseId: 'house-1',
    houseName: 'Test House',
    startDate: '2024-03-01',
    endDate: '2024-07-15',
  });

  const leagues = await journal.listLeagues();
  assert.equal(leagues.length, 1);
  assert.equal(leagues[0].id, league.id);
});

test('createLeague with only a name leaves optional fields null; unknown getLeague is null', async () => {
  const { journal } = await freshJournal();
  const league = await journal.createLeague({ name: 'Minimal' });
  const fetched = await journal.getLeague(league.id);
  assert.deepEqual(fetched, {
    id: league.id,
    name: 'Minimal',
    gamesPerSession: null,
    houseId: null,
    houseName: null,
    startDate: null,
    endDate: null,
  });
  assert.equal(await journal.getLeague('no-such-league'), null);
});

test('updateLeague sets provided fields, preserves omitted ones, and clears with null', async () => {
  const { journal, db } = await freshJournal();
  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-1',
    'Test House',
  ]);
  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-2',
    'Other House',
  ]);
  const league = await journal.createLeague({
    name: 'Original',
    gamesPerSession: 4,
    houseId: 'house-1',
    houseName: 'Test House',
    startDate: '2024-01-10',
    endDate: '2024-05-20',
  });

  // Name-only update: everything else preserved, including houseName.
  const renamed = await journal.updateLeague(league.id, { name: 'Renamed' });
  assert.equal(renamed.name, 'Renamed');
  assert.equal(renamed.gamesPerSession, 4);
  assert.equal(renamed.houseId, 'house-1');
  assert.equal(renamed.houseName, 'Test House');
  assert.equal(renamed.startDate, '2024-01-10');
  assert.equal(renamed.endDate, '2024-05-20');

  // Set values and clear others explicitly.
  const updated = await journal.updateLeague(league.id, {
    name: 'Renamed',
    gamesPerSession: 6,
    houseId: 'house-2',
    houseName: 'Other House',
    startDate: null,
    endDate: null,
  });
  assert.equal(updated.name, 'Renamed');
  assert.equal(updated.gamesPerSession, 6);
  assert.equal(updated.houseId, 'house-2');
  assert.equal(updated.houseName, 'Other House');
  assert.equal(updated.startDate, null);
  assert.equal(updated.endDate, null);

  // Clearing houseName leaves the metadata column NULL.
  const cleared = await journal.updateLeague(league.id, {
    name: 'Renamed',
    houseName: null,
  });
  assert.equal(cleared.houseName, null);
  const raw = await db.getFirstAsync<{ metadata: string | null }>(
    'SELECT metadata FROM leagues WHERE id = ?',
    [league.id]
  );
  assert.ok(raw);
  assert.equal(raw.metadata, null);

  // Unknown league: not found.
  await assert.rejects(
    journal.updateLeague('no-such-league', { name: 'X' }),
    /not found/i
  );
});

test('removeLeague deletes the league and is a no-op for unknown ids', async () => {
  const { journal } = await freshJournal();
  const league = await journal.createLeague({ name: 'Doomed' });
  await journal.removeLeague(league.id);
  assert.equal(await journal.getLeague(league.id), null);
  assert.deepEqual(await journal.listLeagues(), []);
  // Idempotent: deleting again (or an unknown id) does not throw.
  await journal.removeLeague(league.id);
  await journal.removeLeague('no-such-league');
});

test('removeLeague rejects while sessions still reference the league (FK NO ACTION)', async () => {
  const { journal } = await freshJournal();
  const league = await journal.createLeague({ name: 'Has Sessions' });
  const session = await journal.createSession({
    leagueId: league.id,
    date: '2024-06-01',
  });
  await assert.rejects(journal.removeLeague(league.id), /foreign key/i);
  assert.notEqual(await journal.getLeague(league.id), null);
  assert.notEqual(await journal.getSession(session.id), null);
});

test('createSession persists a league session with every field', async () => {
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
  const league = await journal.createLeague({ name: 'Session League' });
  const created = await journal.createSession({
    leagueId: league.id,
    date: '2024-06-15',
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
  const fetched = await journal.getSession(created.id);
  assert.deepEqual(fetched, {
    id: created.id,
    leagueId: league.id,
    date: '2024-06-15',
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
});

test('createSession with leagueId null creates an open (casual) session', async () => {
  const { journal } = await freshJournal();
  const created = await journal.createSession({
    leagueId: null,
    date: '2024-06-09',
  });
  const fetched = await journal.getSession(created.id);
  assert.equal(fetched?.leagueId, null);
  const opens = await journal.listSessions({ leagueId: null });
  assert.deepEqual(
    opens.map((s) => s.id),
    [created.id]
  );
});

test('listSessions returns all sessions by default and filters by league or open', async () => {
  const { journal } = await freshJournal();
  const leagueA = await journal.createLeague({ name: 'A' });
  const leagueB = await journal.createLeague({ name: 'B' });
  const leagueC = await journal.createLeague({ name: 'C' });
  const a1 = await journal.createSession({
    leagueId: leagueA.id,
    date: '2024-06-01',
  });
  const a2 = await journal.createSession({
    leagueId: leagueA.id,
    date: '2024-06-15',
  });
  const b1 = await journal.createSession({
    leagueId: leagueB.id,
    date: '2024-06-05',
  });
  const open1 = await journal.createSession({
    leagueId: null,
    date: '2024-06-03',
  });
  const open2 = await journal.createSession({
    leagueId: null,
    date: '2024-06-20',
  });

  const all = await journal.listSessions();
  assert.deepEqual(
    all.map((s) => s.id),
    [a1.id, open1.id, b1.id, a2.id, open2.id]
  );

  const ofA = await journal.listSessions({ leagueId: leagueA.id });
  assert.deepEqual(
    ofA.map((s) => s.id),
    [a1.id, a2.id]
  );

  const ofB = await journal.listSessions({ leagueId: leagueB.id });
  assert.deepEqual(
    ofB.map((s) => s.id),
    [b1.id]
  );

  const opens = await journal.listSessions({ leagueId: null });
  assert.deepEqual(
    opens.map((s) => s.id),
    [open1.id, open2.id]
  );

  const ofC = await journal.listSessions({ leagueId: leagueC.id });
  assert.deepEqual(ofC, []);
});

test('createSession rejects an invalid leagueId and an invalid date', async () => {
  const { journal } = await freshJournal();
  await assert.rejects(
    journal.createSession({
      leagueId: 'no-such-league',
      date: '2024-06-01',
    }),
    /foreign key/i
  );
  await assert.rejects(
    journal.createSession({ leagueId: null, date: 'not-a-date' }),
    /invalid iso date/i
  );
  assert.deepEqual(await journal.listSessions(), []);
});

test('updateSession changes what is specified and preserves the rest', async () => {
  const { journal, db } = await freshJournal();
  await db.runAsync('INSERT INTO houses (id, name) VALUES (?, ?)', [
    'house-1',
    'Test House',
  ]);
  const leagueA = await journal.createLeague({ name: 'League A' });
  const leagueB = await journal.createLeague({ name: 'League B' });
  const created = await journal.createSession({
    leagueId: leagueA.id,
    date: '2024-06-01',
    weekNumber: 22,
    houseId: 'house-1',
    notes: 'first night',
    laneContext: { leftLane: 2 },
  });

  // Date-only update: everything else preserved.
  const byDate = await journal.updateSession(created.id, {
    date: '2024-06-02',
  });
  assert.equal(byDate.date, '2024-06-02');
  assert.equal(byDate.leagueId, leagueA.id);
  assert.equal(byDate.weekNumber, 22);
  assert.equal(byDate.houseId, 'house-1');
  assert.equal(byDate.notes, 'first night');
  assert.deepEqual(byDate.laneContext, { leftLane: 2 });

  // Reassign to another league.
  const reassigned = await journal.updateSession(created.id, {
    leagueId: leagueB.id,
    date: '2024-06-02',
  });
  assert.equal(reassigned.leagueId, leagueB.id);

  // Open it up.
  const opened = await journal.updateSession(created.id, {
    leagueId: null,
    date: '2024-06-02',
  });
  assert.equal(opened.leagueId, null);

  // Back to A with explicit clears.
  const cleared = await journal.updateSession(created.id, {
    leagueId: leagueA.id,
    date: '2024-06-03',
    weekNumber: null,
    notes: null,
    laneContext: null,
  });
  assert.equal(cleared.leagueId, leagueA.id);
  assert.equal(cleared.date, '2024-06-03');
  assert.equal(cleared.weekNumber, null);
  assert.equal(cleared.notes, null);
  assert.equal(cleared.laneContext, null);

  // Invalid leagueId: FK NO ACTION rejects, session unchanged.
  await assert.rejects(
    journal.updateSession(created.id, {
      leagueId: 'no-such-league',
      date: '2024-06-03',
    }),
    /foreign key/i
  );
  const unchanged = await journal.getSession(created.id);
  assert.equal(unchanged?.leagueId, leagueA.id);

  // Unknown session: not found.
  await assert.rejects(
    journal.updateSession('no-such-session', { date: '2024-06-01' }),
    /not found/i
  );
});

test('removeSession deletes the session and is a no-op for unknown ids', async () => {
  const { journal } = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2024-06-01',
  });
  await journal.removeSession(session.id);
  assert.equal(await journal.getSession(session.id), null);
  assert.deepEqual(await journal.listSessions(), []);
  // Idempotent: deleting again (or an unknown id) does not throw.
  await journal.removeSession(session.id);
  await journal.removeSession('no-such-session');
});

test('listLeagueSummaries derives mostRecentSessionDate from sessions', async () => {
  const { journal } = await freshJournal();

  assert.deepEqual(await journal.listLeagueSummaries(), []);

  const leagueA = await journal.createLeague({
    name: 'Alpha',
    gamesPerSession: 6,
  });
  const leagueB = await journal.createLeague({ name: 'Beta' });
  await journal.createSession({ leagueId: leagueB.id, date: '2024-05-01' });
  await journal.createSession({ leagueId: leagueB.id, date: '2024-07-15' });
  await journal.createSession({ leagueId: leagueB.id, date: '2024-06-20' });

  let summaries = await journal.listLeagueSummaries();
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].id, leagueA.id);
  assert.equal(summaries[0].name, 'Alpha');
  assert.equal(summaries[0].gamesPerSession, 6);
  assert.equal(summaries[0].mostRecentSessionDate, null);
  assert.equal(summaries[1].id, leagueB.id);
  assert.equal(summaries[1].mostRecentSessionDate, '2024-07-15');

  const newest = await journal.createSession({
    leagueId: leagueB.id,
    date: '2024-08-01',
  });
  summaries = await journal.listLeagueSummaries();
  assert.equal(summaries[1].mostRecentSessionDate, '2024-08-01');

  await journal.removeSession(newest.id);
  summaries = await journal.listLeagueSummaries();
  assert.equal(summaries[1].mostRecentSessionDate, '2024-07-15');

  await journal.removeLeague(leagueA.id);
  summaries = await journal.listLeagueSummaries();
  assert.deepEqual(
    summaries.map((s) => s.id),
    [leagueB.id]
  );
});

test('leagues and sessions persist across a closed and reopened connection', async () => {
  const dbFile = path.join(
    os.tmpdir(),
    `c2-journal-persistence-${process.pid}-${Date.now()}.db`
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
    const league = await journal.createLeague({
      name: 'Persistent',
      houseName: 'Kept',
      startDate: '2024-01-01',
    });
    const session = await journal.createSession({
      leagueId: league.id,
      date: '2024-02-02',
    });
    const openSession = await journal.createSession({
      leagueId: null,
      date: '2024-03-03',
    });

    // Close the shared handle (the stub's closeAsync really closes the
    // `DatabaseSync`), then re-open over the same file.
    await dbModule.closeDatabase();
    const reopened = new serviceModule.SqliteLocalJournalService();

    const leagues = await reopened.listLeagues();
    assert.equal(leagues.length, 1);
    assert.equal(leagues[0].id, league.id);
    assert.equal(leagues[0].name, 'Persistent');
    assert.equal(leagues[0].houseName, 'Kept');
    assert.equal(leagues[0].startDate, '2024-01-01');

    const sessions = (await reopened.listSessions()).sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    assert.deepEqual(
      sessions.map((s) => s.id),
      [openSession.id, session.id].sort()
    );

    assert.equal((await reopened.getSession(session.id))?.leagueId, league.id);
    assert.equal((await reopened.getSession(openSession.id))?.leagueId, null);

    // The open session does not count toward the league's summary: only the
    // league's own session does.
    const summaries = await reopened.listLeagueSummaries();
    assert.equal(summaries[0].mostRecentSessionDate, '2024-02-02');
  } finally {
    if (dbModule) {
      await dbModule.closeDatabase();
    }
    clearSeams();
    rmSync(dbFile, { force: true });
  }
});
