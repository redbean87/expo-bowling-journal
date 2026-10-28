/**
 * C-4 T1 (Packets G1/G2) — the version-1 local backup contract and its
 * canonical serializer (`src/services/local-journal/journal-backup-format.ts`).
 *
 * The suite drives the REAL SQLite-backed `SqliteLocalJournalService` over the
 * real `src/db/database.ts` lifecycle (the same `node:sqlite` stub remap the
 * C2–C5 suites use), builds a fixture journal through the service, and asks
 * the serializer for the version-1 document. It pins the contract the captain
 * approved: the `.json` envelope (`format`/`version`/`exportedAt`/`data`) —
 * never the `.pinpal` extension, which stays the real PinPal app's import-only
 * format — the seven canonical tables, preserved UUID keys and relationships,
 * the authoritative roll masks, the denormalized `League.houseName` and the
 * structured `laneContext`/`ballSwitches` values, and the local UTC-midnight
 * date convention (the payload's ISO date maps back to the exact INTEGER the
 * database stores, independent of the process timezone).
 *
 * It also pins what the contract deliberately does NOT carry: derived values
 * (`LeagueSummary.mostRecentSessionDate`, game scores), the legacy
 * `timezoneOffsetMinutes` re-encoding, packed `pins`/numeric `roll1..roll3`,
 * and any sync/draft artifact — and it pins that the serializer refuses to
 * emit a payload whose ids or relationships are broken.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  JOURNAL_BACKUP_FILE_EXTENSION,
  JOURNAL_BACKUP_FORMAT,
  JOURNAL_BACKUP_VERSION,
  buildJournalBackupDocument,
  createJournalBackupDocument,
  readJournalBackupData,
  serializeJournalBackupJson,
  validateJournalBackupData,
} from '../../src/services/local-journal/journal-backup-format';

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

async function loadDatabaseModule(): Promise<DatabaseModule> {
  return import('../../src/db/database');
}

async function loadServiceModule() {
  return import('../../src/services/local-journal/sqlite-local-journal-service');
}

/**
 * A fresh in-memory journal plus a fixture journal built through the service:
 * one house, ball, pattern, league, a league session, an open session, one
 * game, and ten frames (the tenth carrying all three roll masks).
 */
async function freshJournal(): Promise<{
  journal: Journal;
  db: DatabaseHandle;
}> {
  const dbModule = await loadDatabaseModule();
  await dbModule.closeDatabase();
  const serviceModule = await loadServiceModule();
  const db = await dbModule.getDatabase();
  const journal = new serviceModule.SqliteLocalJournalService();

  const house = await journal.createHouse({
    name: 'Test House',
    location: 'Springfield',
  });
  const ball = await journal.createBall({
    name: 'Zen 25',
    brand: 'Roto Grip',
    coverstock: 'eTruity+2.5',
  });
  const pattern = await journal.createPattern({
    name: 'Cheetah',
    length: 41,
  });
  const league = await journal.createLeague({
    name: 'Thursday Night',
    gamesPerSession: 3,
    houseId: house.id,
    houseName: 'Test House',
    startDate: '2026-03-08',
    endDate: '2026-03-29',
  });
  const leagueSession = await journal.createSession({
    leagueId: league.id,
    date: '2026-03-15',
    weekNumber: 2,
    houseId: house.id,
    ballId: ball.id,
    patternId: pattern.id,
    notes: 'week 2',
    laneContext: { leftLane: 7, rightLane: 8 },
  });
  await journal.createSession({
    leagueId: null,
    date: '2026-03-14',
  });
  const game = await journal.createGame({
    sessionId: leagueSession.id,
    date: '2026-03-15',
    houseId: house.id,
    ballId: ball.id,
    patternId: pattern.id,
    handicap: 10.5,
    notes: 'game 1',
    laneContext: {
      leftLane: 7,
      rightLane: 8,
      lanePair: '7/8',
      startingLane: 7,
    },
    ballSwitches: [
      {
        frameNumber: 6,
        rollNumber: 1,
        ballId: ball.id,
        ballName: 'Zen 25',
        note: 'swap',
      },
      { frameNumber: 10 },
    ],
  });
  const ALL_TEN = 0b1111111111;
  await journal.replaceGameFrames(game.id, [
    { frameNumber: 1, roll1Mask: ALL_TEN },
    { frameNumber: 2, roll1Mask: 0b0000001111, roll2Mask: 0b1111000000 },
    { frameNumber: 3, roll1Mask: 0b0101010101 },
    { frameNumber: 4, roll1Mask: 0b1010101010 },
    { frameNumber: 5, roll1Mask: 0b0011001100 },
    { frameNumber: 6, roll1Mask: 0b1100110011, ballId: ball.id },
    { frameNumber: 7, roll1Mask: 0b0000000011 },
    { frameNumber: 8, roll1Mask: 0b1111111110 },
    { frameNumber: 9, roll1Mask: 0b0000111100 },
    {
      frameNumber: 10,
      roll1Mask: ALL_TEN,
      roll2Mask: 0b0000000111,
      roll3Mask: 0b1000000000,
    },
  ]);

  return { journal, db };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Every property name that appears anywhere in a backup document. */
function collectDocumentKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (const item of current) {
        pending.push(item);
      }
      continue;
    }
    if (current === null || typeof current !== 'object') {
      continue;
    }
    for (const [key, nested] of Object.entries(current)) {
      keys.add(key);
      pending.push(nested);
    }
  }
  return keys;
}

/* -------------------------------------------------------------------------- */
/* G1 — the envelope contract                                                  */
/* -------------------------------------------------------------------------- */

test('the version-1 envelope is self-describing and the file extension is .json', async () => {
  const { journal } = await freshJournal();
  const document = await buildJournalBackupDocument(
    journal,
    '2026-10-28T13:58:00.000Z'
  );

  assert.deepEqual(Object.keys(document), [
    'format',
    'version',
    'exportedAt',
    'data',
  ]);
  assert.equal(document.format, JOURNAL_BACKUP_FORMAT);
  assert.equal(document.format, 'bowling-journal');
  assert.notEqual(document.format, 'pinpal');
  assert.equal(document.version, JOURNAL_BACKUP_VERSION);
  assert.equal(document.version, 1);
  assert.equal(document.exportedAt, '2026-10-28T13:58:00.000Z');
  assert.deepEqual(Object.keys(document.data), [
    'balls',
    'houses',
    'patterns',
    'leagues',
    'sessions',
    'games',
    'frames',
  ]);

  // The version marker is discoverable before the payload is parsed (§4).
  const json = serializeJournalBackupJson(document);
  assert.ok(
    json.startsWith(
      `{"format":"${JOURNAL_BACKUP_FORMAT}","version":${JOURNAL_BACKUP_VERSION},"exportedAt":`
    )
  );

  // The extension is the approved one; `.pinpal` and `.db` stay elsewhere.
  assert.equal(JOURNAL_BACKUP_FILE_EXTENSION, '.json');
  assert.notEqual(JOURNAL_BACKUP_FILE_EXTENSION, '.pinpal');
  assert.notEqual(JOURNAL_BACKUP_FILE_EXTENSION, '.db');

  // The document is plain JSON: it survives a text round-trip unchanged.
  assert.deepEqual(JSON.parse(json), document);
});

test('an unparseable export timestamp is rejected rather than written verbatim', () => {
  assert.throws(
    () =>
      createJournalBackupDocument(
        {
          balls: [],
          houses: [],
          patterns: [],
          leagues: [],
          sessions: [],
          games: [],
          frames: [],
        },
        'not a date'
      ),
    /exportedAt must be a parseable ISO-8601 timestamp/
  );
});

/* -------------------------------------------------------------------------- */
/* G2 — canonical serialization                                                */
/* -------------------------------------------------------------------------- */

test('serialization covers all seven canonical tables and preserves every row', async () => {
  const { journal } = await freshJournal();
  const data = await readJournalBackupData(journal);

  assert.equal(data.balls.length, 1);
  assert.equal(data.houses.length, 1);
  assert.equal(data.patterns.length, 1);
  assert.equal(data.leagues.length, 1);
  assert.equal(data.sessions.length, 2);
  assert.equal(data.games.length, 1);
  assert.equal(data.frames.length, 10);

  const entities = [
    ...data.balls,
    ...data.houses,
    ...data.patterns,
    ...data.leagues,
    ...data.sessions,
    ...data.games,
    ...data.frames,
  ];
  for (const entity of entities) {
    assert.match(entity.id, UUID_PATTERN);
  }
  assert.equal(
    new Set(entities.map((entity) => entity.id)).size,
    entities.length
  );
});

test('serialization preserves the canonical relationships and the roll masks', async () => {
  const { journal } = await freshJournal();
  const data = await readJournalBackupData(journal);

  const [league] = data.leagues;
  const [session] = data.sessions.filter(
    (candidate) => candidate.leagueId !== null
  );
  const [openSession] = data.sessions.filter(
    (candidate) => candidate.leagueId === null
  );
  const [game] = data.games;
  const frames = data.frames;

  assert.equal(session.leagueId, league.id);
  assert.equal(openSession.leagueId, null);
  assert.equal(game.sessionId, session.id);
  assert.equal(frames.length, 10);
  for (const frame of frames) {
    assert.equal(frame.gameId, game.id);
  }
  assert.deepEqual(
    frames.map((frame) => frame.frameNumber),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );

  const allTen = 0b1111111111;
  assert.equal(frames[0].roll1Mask, allTen);
  assert.equal(frames[0].roll2Mask, null);
  assert.equal(frames[0].roll3Mask, null);
  assert.equal(frames[1].roll1Mask, 0b0000001111);
  assert.equal(frames[1].roll2Mask, 0b1111000000);
  assert.equal(frames[5].ballId, data.balls[0].id);
  assert.equal(frames[9].roll1Mask, allTen);
  assert.equal(frames[9].roll2Mask, 0b0000000111);
  assert.equal(frames[9].roll3Mask, 0b1000000000);

  assert.equal(session.houseId, data.houses[0].id);
  assert.equal(session.ballId, data.balls[0].id);
  assert.equal(session.patternId, data.patterns[0].id);
  assert.equal(game.houseId, data.houses[0].id);
  assert.equal(game.ballId, data.balls[0].id);
  assert.equal(game.patternId, data.patterns[0].id);
  assert.equal(league.houseId, data.houses[0].id);
});

test('serialization preserves required metadata and structured values', async () => {
  const { journal } = await freshJournal();
  const data = await readJournalBackupData(journal);
  const [league] = data.leagues;
  const [session] = data.sessions.filter(
    (candidate) => candidate.leagueId !== null
  );
  const [game] = data.games;

  // `League.houseName` has no canonical column: it is persisted inside the
  // league `metadata` JSON column and must come back out of it.
  assert.equal(league.name, 'Thursday Night');
  assert.equal(league.houseName, 'Test House');
  assert.equal(league.gamesPerSession, 3);

  assert.equal(session.notes, 'week 2');
  assert.deepEqual(session.laneContext, { leftLane: 7, rightLane: 8 });
  assert.equal(game.notes, 'game 1');
  assert.equal(game.handicap, 10.5);
  assert.deepEqual(game.laneContext, {
    leftLane: 7,
    rightLane: 8,
    lanePair: '7/8',
    startingLane: 7,
  });
  assert.deepEqual(game.ballSwitches, [
    {
      frameNumber: 6,
      rollNumber: 1,
      ballId: data.balls[0].id,
      ballName: 'Zen 25',
      note: 'swap',
    },
    { frameNumber: 10 },
  ]);
});

test('dates keep the local UTC-midnight convention in any process timezone', async () => {
  const { journal, db } = await freshJournal();
  const data = await readJournalBackupData(journal);

  const rawSessions = await db.getAllAsync<{ id: string; date: number }>(
    'SELECT id, date FROM sessions ORDER BY date, id'
  );
  const rawGames = await db.getAllAsync<{ id: string; date: number }>(
    'SELECT id, date FROM games ORDER BY date, id'
  );
  const stored = new Map<string, number>();
  for (const row of [...rawSessions, ...rawGames]) {
    stored.set(row.id, row.date);
  }

  // The payload carries the domain ISO date, and that ISO date maps to the
  // exact INTEGER the database stores under the app's UTC-midnight rule —
  // no device-local re-encoding, so the value cannot shift a day.
  for (const session of data.sessions) {
    assert.match(session.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(
      Date.parse(`${session.date}T00:00:00Z`),
      stored.get(session.id)
    );
  }
  for (const game of data.games) {
    assert.match(game.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(Date.parse(`${game.date}T00:00:00Z`), stored.get(game.id));
  }

  const [league] = data.leagues;
  const [leagueSession] = data.sessions.filter(
    (candidate) => candidate.leagueId === league.id
  );
  assert.equal(league.startDate, '2026-03-08');
  assert.equal(league.endDate, '2026-03-29');
  assert.equal(leagueSession.date, '2026-03-15');
  assert.equal(Date.parse('2026-03-15T00:00:00Z'), 1773532800000);
});

test('the payload carries no derived, legacy, or sync artifacts (§2.7)', async () => {
  const { journal } = await freshJournal();
  const document = await buildJournalBackupDocument(
    journal,
    '2026-10-28T13:58:00.000Z'
  );

  const keys = collectDocumentKeys(document);
  for (const forbidden of [
    'mostRecentSessionDate',
    'totalScore',
    'frameScores',
    'settledRunningTotals',
    'strikes',
    'spares',
    'opens',
    'isComplete',
    'pins',
    'roll1',
    'roll2',
    'roll3',
    'timezoneOffsetMinutes',
    'clientSyncId',
    'draftId',
    'snapshotJson',
  ]) {
    assert.equal(keys.has(forbidden), false);
  }
});

test('an empty journal exports an envelope with seven empty tables', async () => {
  const dbModule = await loadDatabaseModule();
  await dbModule.closeDatabase();
  const serviceModule = await loadServiceModule();
  const journal = new serviceModule.SqliteLocalJournalService();
  const data = await readJournalBackupData(journal);

  assert.deepEqual(data, {
    balls: [],
    houses: [],
    patterns: [],
    leagues: [],
    sessions: [],
    games: [],
    frames: [],
  });
});

test('the serializer refuses a payload with a broken relationship or duplicate id', () => {
  const ballId = '11111111-1111-4111-9111-111111111111';
  const missingSessionId = '22222222-2222-4222-8222-222222222222';

  assert.throws(
    () =>
      validateJournalBackupData({
        balls: [{ id: ballId, name: 'Zen 25' }],
        houses: [],
        patterns: [],
        leagues: [],
        sessions: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            leagueId: null,
            date: '2026-03-15',
            ballId,
          },
        ],
        games: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            sessionId: missingSessionId,
            date: '2026-03-15',
          },
        ],
        frames: [],
      }),
    /Game 44444444-4444-4444-8444-444444444444 references session/
  );

  assert.throws(
    () =>
      validateJournalBackupData({
        balls: [
          { id: ballId, name: 'Zen 25' },
          { id: ballId, name: 'Duplicate' },
        ],
        houses: [],
        patterns: [],
        leagues: [],
        sessions: [],
        games: [],
        frames: [],
      }),
    /duplicate id/
  );

  assert.throws(
    () =>
      validateJournalBackupData({
        balls: [{ id: '', name: 'No id' }],
        houses: [],
        patterns: [],
        leagues: [],
        sessions: [],
        games: [],
        frames: [],
      }),
    /an entity has no id/
  );
});
