/**
 * C-4 T7 — export-then-import round trips for both PinPal `.db` dialects.
 *
 * One synthetic journal is written through the local service, exported
 * through BOTH dialect writers (T2's Android container and T3's iOS
 * container, over T1's shared converter), imported back through the local
 * importer (T5), and compared against itself in canonical form: game
 * scores, per-frame roll counts, frame counts and order, session dates,
 * and the reference names and notes the legacy format carries. The two
 * dialects are then compared against each other, which is the point of
 * this slice: the same logical journal must survive either container even
 * though the containers differ physically — `_id` versus `pk` keys, 4096-
 * versus 1024-byte pages, epoch-millisecond versus epoch-second dates,
 * raw SQLite versus the plist-wrapped compound file.
 *
 * The suite drives the real writers and the real importer with `expo-sqlite`
 * remapped to `./stubs/pinpal-import-expo-sqlite-stub.mjs`, the same
 * `node:sqlite`-backed stub the import suite uses, so a round trip is bytes
 * through a real SQLite database and back, never a hand-written fixture.
 *
 * ## What the round trip proves equal
 *
 * Scores (`getGameScore` before and after), each ball's pin count, the
 * frames a game holds and their order, session dates through both date
 * units, and the names/notes the legacy tables carry: house, ball and
 * pattern names, league name and `gamesPerSession`, the league's denormalized
 * `houseName`, session and game notes, and each frame's `ballId`.
 *
 * ## What the round trip cannot carry, and how this suite says so
 *
 * The suite never claims a lossless round trip. These are asserted as
 * losses, one by one, and each is checked against the scores so nothing
 * authoritative moves silently:
 *
 * - Entity keys: the legacy integer keys never reach the journal, so every
 *   restored entity gets a fresh `Uuid` (the journal's schema is unchanged).
 * - Roll masks: the legacy format packs standing-pin masks, so a ball's
 *   pin COUNT survives and its bit positions do not. One frame is seeded
 *   with a non-canonical mask and the suite asserts the count, not the bits.
 * - Columns the legacy tables do not declare: `house.location`,
 *   `pattern.length`, `ball.brand`/`ball.coverstock`,
 *   `league.startDate`/`league.endDate`, `session.weekNumber`,
 *   `game.handicap`, `game.ballSwitches`. They come back `null`.
 * - `laneContext`: the Android `week`/`game` `lane` column exists but the
 *   converter writes NULL (the journal's lane context is a pair, not one
 *   lane), and the iOS tables do not declare it at all.
 * - `game.date`: the legacy `game` table has no date, so the importer takes
 *   the week's date; the suite dates every game with its own session.
 * - `league.ballFk`/`league.patternFk`: the journal has no league-level ball
 *   or pattern, so the converter writes "no reference" and they come back
 *   absent.
 * - `frame.flags`: the legacy format marks a frame as strike (193) or
 *   non-strike (195), so the journal's own flag values are normalized.
 * - iOS only: `frame.pocket`/`footBoard`/`targetBoard` — the iOS `frame`
 *   table does not declare them, so they read back as absent while the
 *   Android dialect keeps them.
 * - A frame whose second ball was never thrown: the legacy row packs "one
 *   ball, then whatever stands" and "second ball, gutter" identically, so
 *   `roll2Mask: null` on a non-strike frame — and a spare tenth with no
 *   bonus ball — comes back as a zero second ball. That is the one
 *   bowling-visible difference, and it is kept in its own test rather than
 *   smoothed into the comparisons above: the provisional total score is
 *   unchanged, only the frame's settlement changes.
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { after, test } from 'node:test';

import { readJournalBackupData } from '../../src/services/local-journal/journal-backup-format';
import {
  PINPAL_NON_STRIKE_FRAME_FLAG,
  PINPAL_STRIKE_FRAME_FLAG,
  buildPinPalLegacyRows,
} from '../../src/services/local-journal/pinpal-backup-rows';
import { registerStubRemaps } from '../harness/remap';

import type { JournalBackupData } from '../../src/services/local-journal/journal-backup-format';
import type { PinpalImportResult } from '../../src/services/local-journal/pinpal-backup-import';
import type { PinPalLegacyRows } from '../../src/services/local-journal/pinpal-backup-rows';
import type {
  Frame,
  FrameInput,
  Game,
  GameScore,
} from '../../src/services/local-journal/types';

type DatabaseModule = typeof import('../../src/db/database');
type ServiceModule =
  typeof import('../../src/services/local-journal/sqlite-local-journal-service');
type Journal = InstanceType<ServiceModule['SqliteLocalJournalService']>;
type PinpalImportModule =
  typeof import('../../src/services/local-journal/pinpal-backup-import');
type AndroidDialectModule =
  typeof import('../../src/hooks/journal/export-backup/android-pinpal-dialect');
type IosDialectModule =
  typeof import('../../src/hooks/journal/export-backup/ios-pinpal-dialect');

/**
 * The writers, the importer, and the journal service all reach the native
 * `expo-sqlite` module, so the remap is registered before any of them loads.
 */
const stubRewrites: Record<string, string> = {
  'expo-sqlite': path.join(
    __dirname,
    'stubs',
    'pinpal-import-expo-sqlite-stub.mjs'
  ),
};

const hookHandle = registerStubRemaps(() => stubRewrites);

after(() => {
  hookHandle.deregister();
});

/** A mask for `count` pins knocked down, matching `getRollValue`'s count. */
function knockedDown(count: number) {
  return (1 << count) - 1;
}

/** `null` stays `null`; a pin count becomes the mask that many pins knock down. */
function maskOrNull(count: number | null): number | null {
  return count === null ? null : knockedDown(count);
}

/**
 * The pin count a roll mask carries.
 *
 * The legacy format packs standing-pin masks and the encoder picks which
 * pins stand, so a round trip preserves each ball's count rather than the
 * original bit positions. This is the value both halves agree on.
 */
function rollCount(mask: number | null | undefined): number | null {
  if (mask === null || mask === undefined) {
    return null;
  }

  let count = 0;
  let remaining = mask;

  while (remaining !== 0) {
    count += remaining & 1;
    remaining >>= 1;
  }

  return count;
}

/** Five pins knocked down, written as the HIGH five bits rather than the low five. */
const HIGH_FIVE = 0b11111 << 5;
const HIGH_THREE = 0b111 << 7;

/**
 * The offset the export hook passes on the way out (`new Date().getTimezoneOffset()`
 * on a UTC+2 device), supplied here so the suite never reads a clock: the
 * importer applies it in reverse, and both halves must agree.
 */
const TIMEZONE_OFFSET_MINUTES = -120;

/** The database the two dialect writers open, and the journal's own name. */
const BACKUP_DATABASE_NAME = ':memory:';

/** Nothing in these files is unimportable. */
const NOTHING_SKIPPED = {
  houses: 0,
  patterns: 0,
  balls: 0,
  leagues: 0,
  weeks: 0,
  games: 0,
  frames: 0,
};

/** Unwrap a lookup this journal should have carried. */
function one<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${label} is missing from the journal`);
  }

  return value;
}

/**
 * A fresh journal, reopened from the stub's own temp-backed database.
 *
 * The journal shares one database handle, so only one journal is open at a
 * time: a test reads the source journal into memory, then opens the target.
 */
async function freshJournal(): Promise<Journal> {
  const dbModule = (await import('../../src/db/database')) as DatabaseModule;
  const serviceModule =
    (await import('../../src/services/local-journal/sqlite-local-journal-service')) as ServiceModule;

  await dbModule.closeDatabase();
  await dbModule.getDatabase();

  return new serviceModule.SqliteLocalJournalService();
}

/** The name the journal's own database opens under. */
async function journalDatabaseName(): Promise<string> {
  return (await import('../../src/db/database')).DATABASE_NAME;
}

/** Every database name the stub has been asked to open, in order. */
async function openedDatabaseNames(): Promise<string[]> {
  return (globalThis as Record<string, unknown>)[
    '__pinpalImportOpenedDatabaseNames'
  ] as string[];
}

/** The Android container's bytes for these rows. */
async function androidImage(rows: PinPalLegacyRows): Promise<Uint8Array> {
  const writer =
    (await import('../../src/hooks/journal/export-backup/android-pinpal-dialect')) as AndroidDialectModule;

  return await writer.buildAndroidPinpalBackupImage(rows);
}

/** The iOS container's bytes for these rows. */
async function iosImage(rows: PinPalLegacyRows): Promise<Uint8Array> {
  const writer =
    (await import('../../src/hooks/journal/export-backup/ios-pinpal-dialect')) as IosDialectModule;

  return await writer.buildIosPinpalBackupImage(rows);
}

/** One file's bytes imported into the journal that is currently open. */
async function importBytes(
  bytes: Uint8Array,
  journal: Journal
): Promise<PinpalImportResult> {
  const importer = (await pinpalImportModule()) as PinpalImportModule;

  return await importer.importPinPalBackupIntoJournal(
    bytes,
    journal,
    TIMEZONE_OFFSET_MINUTES
  );
}

/** Loaded after this file's hooks are registered, so `expo-sqlite` is remapped. */
async function pinpalImportModule(): Promise<PinpalImportModule> {
  return (await import('../../src/services/local-journal/pinpal-backup-import')) as PinpalImportModule;
}

/**
 * The synthetic journal: two leagues, three sessions (one open, one carrying
 * nothing but its date), five games, and two of every reference entity — one
 * of each carrying only a name, so the optional columns are visibly absent
 * rather than assumed.
 *
 * The games cover every bowling shape: a perfect game (three strikes in the
 * tenth), an all-spare game with a bonus ball, an open game with an open
 * tenth, a mixed game (strike, spare through a gutter ball, open frame, a
 * tenth needing all three balls, and a frame whose mask uses the HIGH pins),
 * and a casual game in an open session that carries no house, ball, or
 * pattern at all. Frames carry their own `ballId` and board columns.
 */
async function seedJournal(): Promise<Journal> {
  const journal = await freshJournal();

  const maple = await journal.createHouse({
    name: 'Maple Bowlhouse',
    location: 'Springfield',
  });
  await journal.createHouse({ name: 'Pine Lanes' });

  const cheetah = await journal.createPattern({
    name: 'Cheetah',
    length: 41,
  });
  await journal.createPattern({ name: 'Gepard' });

  const zen = await journal.createBall({
    name: 'Zen 25',
    brand: 'Roto Grip',
  });
  await journal.createBall({ name: 'Eboni' });

  const thursday = await journal.createLeague({
    name: 'Thursday Night',
    gamesPerSession: 3,
    houseId: maple.id,
    houseName: maple.name,
    startDate: '2026-03-01',
    endDate: '2026-04-26',
  });
  const sunday = await journal.createLeague({ name: 'Sunday Scratch' });

  const thursdaySession = await journal.createSession({
    leagueId: thursday.id,
    date: '2026-03-12',
    weekNumber: 2,
    houseId: maple.id,
    ballId: zen.id,
    patternId: cheetah.id,
    notes: 'week 2',
    laneContext: { leftLane: 12, rightLane: 13 },
  });
  const sundaySession = await journal.createSession({
    leagueId: sunday.id,
    date: '2026-03-08',
  });
  const openSession = await journal.createSession({
    leagueId: null,
    date: '2026-03-14',
  });

  const perfect = await journal.createGame({
    sessionId: thursdaySession.id,
    date: '2026-03-12',
    houseId: maple.id,
    ballId: zen.id,
    patternId: cheetah.id,
    notes: 'perfect game',
    handicap: 4,
    laneContext: { leftLane: 12 },
    ballSwitches: [{ frameNumber: 5, ballId: zen.id }],
  });
  await journal.replaceGameFrames(
    perfect.id,
    countedFrames([10, null], [10, 10, 10])
  );

  const spare = await journal.createGame({
    sessionId: thursdaySession.id,
    date: '2026-03-12',
    houseId: maple.id,
    ballId: zen.id,
    patternId: cheetah.id,
    notes: 'spare game',
  });
  await journal.replaceGameFrames(spare.id, countedFrames([7, 3], [7, 3, 4]));

  const open = await journal.createGame({
    sessionId: thursdaySession.id,
    date: '2026-03-12',
    notes: 'open game',
  });
  await journal.replaceGameFrames(open.id, countedFrames([5, 3], [5, 3, null]));

  const mixed = await journal.createGame({
    sessionId: sundaySession.id,
    date: '2026-03-08',
    notes: 'mixed game',
  });
  await journal.replaceGameFrames(mixed.id, mixedFrames(zen.id));

  const casual = await journal.createGame({
    sessionId: openSession.id,
    date: '2026-03-14',
    notes: 'casual game',
  });
  await journal.replaceGameFrames(
    casual.id,
    countedFrames([4, 6], [9, 0, null])
  );

  return journal;
}

/** A game's ten frames as pin counts, turned into the service's roll masks. */
function countedFrames(
  opening: [number, number | null],
  tenth: [number, number | null, number | null]
): FrameInput[] {
  const frames: FrameInput[] = [];

  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    frames.push({
      frameNumber,
      roll1Mask: knockedDown(opening[0]),
      roll2Mask: maskOrNull(opening[1]),
      roll3Mask: null,
    });
  }

  frames.push({
    frameNumber: 10,
    roll1Mask: knockedDown(tenth[0]),
    roll2Mask: maskOrNull(tenth[1]),
    roll3Mask: maskOrNull(tenth[2]),
  });

  return frames;
}

/**
 * One game that mixes every shape the legacy format encodes, including a
 * frame whose mask uses the HIGH pins (`HIGH_FIVE`/`HIGH_THREE`) so the
 * count-not-bits rule is visible, and board columns the iOS table drops.
 */
function mixedFrames(ballId: string): FrameInput[] {
  return [
    {
      frameNumber: 1,
      roll1Mask: knockedDown(10),
      roll2Mask: null,
      roll3Mask: null,
      ballId,
      flags: 1,
      pocket: 3,
      footBoard: 5,
      targetBoard: 7,
    },
    {
      frameNumber: 2,
      roll1Mask: knockedDown(7),
      roll2Mask: knockedDown(3),
      roll3Mask: null,
    },
    {
      frameNumber: 3,
      roll1Mask: HIGH_FIVE,
      roll2Mask: HIGH_THREE,
      roll3Mask: null,
    },
    {
      frameNumber: 4,
      roll1Mask: knockedDown(0),
      roll2Mask: knockedDown(10),
      roll3Mask: null,
    },
    {
      frameNumber: 5,
      roll1Mask: knockedDown(3),
      roll2Mask: knockedDown(4),
      roll3Mask: null,
    },
    {
      frameNumber: 6,
      roll1Mask: knockedDown(10),
      roll2Mask: null,
      roll3Mask: null,
    },
    {
      frameNumber: 7,
      roll1Mask: knockedDown(9),
      roll2Mask: knockedDown(0),
      roll3Mask: null,
    },
    {
      frameNumber: 8,
      roll1Mask: knockedDown(4),
      roll2Mask: knockedDown(5),
      roll3Mask: null,
      flags: 2,
    },
    {
      frameNumber: 9,
      roll1Mask: knockedDown(2),
      roll2Mask: knockedDown(2),
      roll3Mask: null,
    },
    {
      frameNumber: 10,
      roll1Mask: knockedDown(10),
      roll2Mask: knockedDown(9),
      roll3Mask: knockedDown(0),
      ballId,
      pocket: 4,
      footBoard: 6,
      targetBoard: 8,
    },
  ];
}

/**
 * A journal holding two games that are not finished: one stopped at frame 3,
 * whose frame 2 has no second ball yet, and one whose tenth frame is a spare
 * with no bonus ball entered. Both are the shapes the legacy row format
 * cannot tell apart from a finished frame.
 */
async function seedInProgressJournal(): Promise<Journal> {
  const journal = await freshJournal();
  const session = await journal.createSession({
    leagueId: null,
    date: '2026-03-14',
  });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2026-03-14',
    notes: 'in progress',
  });

  await journal.replaceGameFrames(game.id, [
    {
      frameNumber: 1,
      roll1Mask: knockedDown(4),
      roll2Mask: knockedDown(0),
      roll3Mask: null,
    },
    {
      frameNumber: 2,
      roll1Mask: knockedDown(4),
      roll2Mask: null,
      roll3Mask: null,
    },
    {
      frameNumber: 3,
      roll1Mask: knockedDown(10),
      roll2Mask: null,
      roll3Mask: null,
    },
  ]);

  const spareTenth = await journal.createGame({
    sessionId: session.id,
    date: '2026-03-14',
    notes: 'spare tenth',
  });
  await journal.replaceGameFrames(
    spareTenth.id,
    countedFrames([5, 5], [7, 3, null])
  );

  return journal;
}

/** One game in a snapshot, found by the notes that name it. */
function gameOf(snapshot: JournalBackupData, gameNotes: string): Game {
  const game = snapshot.games.find(
    (candidate) => (candidate.notes ?? '') === gameNotes
  );

  if (game === undefined) {
    throw new Error(`no game named "${gameNotes}" in the snapshot`);
  }

  return game;
}

/* -------------------------------------------------------------------------- */
/* The canonical view both halves must agree on                               */
/* -------------------------------------------------------------------------- */

interface CanonicalFrame {
  frameNumber: number;
  roll1: number | null;
  roll2: number | null;
  roll3: number | null;
  ballName: string | null;
}

interface CanonicalGame {
  date: string;
  houseName: string | null;
  ballName: string | null;
  patternName: string | null;
  notes: string | null;
  frameCount: number;
  score: GameScore;
  frames: CanonicalFrame[];
}

interface CanonicalSession {
  date: string;
  leagueName: string | null;
  houseName: string | null;
  ballName: string | null;
  patternName: string | null;
  notes: string | null;
}

interface CanonicalLeague {
  gamesPerSession: number | null;
  houseName: string | null;
}

/**
 * The journal as the bowling data the legacy format can carry, keyed by the
 * names and dates that survive rather than by the entity ids that do not.
 *
 * Scores come from the service's own `getGameScore`, so the comparison is
 * the app's bowling view rather than a re-derivation of it.
 */
async function canonicalJournal(journal: Journal): Promise<{
  balls: string[];
  houses: string[];
  patterns: string[];
  leagues: Record<string, CanonicalLeague>;
  sessions: Record<string, CanonicalSession>;
  games: Record<string, CanonicalGame>;
}> {
  const balls = await journal.listBalls();
  const houses = await journal.listHouses();
  const patterns = await journal.listPatterns();
  const leagues = await journal.listLeagues();
  const sessions = await journal.listSessions();
  const games = await journal.listGames();

  const nameOf = (
    names: Map<string, string>,
    id: string | null | undefined
  ): string | null => {
    if (id === null || id === undefined) {
      return null;
    }

    return names.get(id) ?? null;
  };

  const ballNames = new Map<string, string>(
    balls.map((ball) => [ball.id, ball.name])
  );
  const houseNames = new Map<string, string>(
    houses.map((house) => [house.id, house.name])
  );
  const patternNames = new Map<string, string>(
    patterns.map((pattern) => [pattern.id, pattern.name])
  );
  const leagueNames = new Map<string, string>(
    leagues.map((league) => [league.id, league.name])
  );

  const sessionKeys = new Map<string, string>();
  for (const session of sessions) {
    sessionKeys.set(session.id, `${session.date}|${session.notes ?? ''}`);
  }

  const leagueEntries = leagues.map((league) => ({
    key: league.name,
    view: {
      gamesPerSession: league.gamesPerSession ?? null,
      houseName: league.houseName ?? null,
    },
  }));

  const sessionEntries = sessions.map((session) => ({
    key: one(sessionKeys.get(session.id), 'session key'),
    view: {
      date: session.date,
      leagueName: nameOf(leagueNames, session.leagueId),
      houseName: nameOf(houseNames, session.houseId),
      ballName: nameOf(ballNames, session.ballId),
      patternName: nameOf(patternNames, session.patternId),
      notes: session.notes ?? null,
    },
  }));

  const gameEntries: Array<{ key: string; view: CanonicalGame }> = [];

  for (const game of games) {
    const frames = await journal.getGameFrames(game.id);
    const score = await journal.getGameScore(game.id);

    gameEntries.push({
      key: `${one(sessionKeys.get(game.sessionId), 'session key')}|${game.notes ?? ''}`,
      view: {
        date: game.date,
        houseName: nameOf(houseNames, game.houseId),
        ballName: nameOf(ballNames, game.ballId),
        patternName: nameOf(patternNames, game.patternId),
        notes: game.notes ?? null,
        frameCount: frames.length,
        score: one(score, 'game score'),
        frames: frames.map((frame) => ({
          frameNumber: frame.frameNumber,
          roll1: rollCount(frame.roll1Mask),
          roll2: rollCount(frame.roll2Mask),
          roll3: rollCount(frame.roll3Mask),
          ballName: nameOf(ballNames, frame.ballId),
        })),
      },
    });
  }

  return {
    balls: balls.map((ball) => ball.name).sort(),
    houses: houses.map((house) => house.name).sort(),
    patterns: patterns.map((pattern) => pattern.name).sort(),
    leagues: byKey(leagues.length, leagueEntries),
    sessions: byKey(sessions.length, sessionEntries),
    games: byKey(games.length, gameEntries),
  };
}

/** Entries keyed by `key`, in sorted key order, as a plain object. */
function byKey<T>(
  count: number,
  entries: Array<{ key: string; view: T }>
): Record<string, T> {
  const sorted = entries.sort((left, right) =>
    left.key.localeCompare(right.key)
  );
  const result: Record<string, T> = {};

  for (const entry of sorted) {
    result[entry.key] = entry.view;
  }

  assert.strictEqual(Object.keys(result).length, count, 'every key is unique');

  return result;
}

/** One game's frame, found by the notes that name the game and its number. */
function frameOf(
  snapshot: JournalBackupData,
  gameNotes: string,
  frameNumber: number
): Frame {
  const game = snapshot.games.find(
    (candidate) => (candidate.notes ?? '') === gameNotes
  );

  if (game === undefined) {
    throw new Error(`no game named "${gameNotes}" in the snapshot`);
  }

  const frame = snapshot.frames.find(
    (candidate) =>
      candidate.gameId === game.id && candidate.frameNumber === frameNumber
  );

  if (frame === undefined) {
    throw new Error(
      `game "${gameNotes}" has no frame ${frameNumber} in the snapshot`
    );
  }

  return frame;
}

/** Every legacy integer key one table carries, in row order. */
function legacyKeys(rows: PinPalLegacyRows): {
  houses: number[];
  patterns: number[];
  balls: number[];
  leagues: number[];
  weeks: number[];
  games: number[];
  frames: number[];
} {
  return {
    houses: rows.houses.map((row) => row.sqliteId),
    patterns: rows.patterns.map((row) => row.sqliteId),
    balls: rows.balls.map((row) => row.sqliteId),
    leagues: rows.leagues.map((row) => row.sqliteId),
    weeks: rows.weeks.map((row) => row.sqliteId),
    games: rows.games.map((row) => row.sqliteId),
    frames: rows.frames.map((row) => row.sqliteId),
  };
}

/** The tenth frame's three balls as pin counts, from a canonical snapshot. */
function tenthRolls(snapshot: JournalBackupData, gameNotes: string): number[] {
  const frame = frameOf(snapshot, gameNotes, 10);

  return [frame.roll1Mask, frame.roll2Mask, frame.roll3Mask].map(
    (mask) => rollCount(mask) ?? -1
  );
}

/** `from` through `to`, inclusive. */
function range(from: number, to: number): number[] {
  const values: number[] = [];

  for (let value = from; value <= to; value += 1) {
    values.push(value);
  }

  return values;
}

/* -------------------------------------------------------------------------- */
/* T7.1 — each dialect round-trips the journal                                */
/* -------------------------------------------------------------------------- */

test('the android dialect round-trips the journal without a skipped row', async () => {
  const sourceJournal = await seedJournal();
  const source = await canonicalJournal(sourceJournal);
  const snapshot = await readJournalBackupData(sourceJournal);
  const rows = buildPinPalLegacyRows(snapshot, TIMEZONE_OFFSET_MINUTES);
  const image = await androidImage(rows);

  const target = await freshJournal();
  const result = await importBytes(image, target);

  assert.strictEqual(result.dialect, 'android');
  assert.deepStrictEqual(result.skipped, NOTHING_SKIPPED);
  assert.deepStrictEqual(await canonicalJournal(target), source);
});

test('the ios dialect round-trips the journal without a skipped row', async () => {
  const sourceJournal = await seedJournal();
  const source = await canonicalJournal(sourceJournal);
  const snapshot = await readJournalBackupData(sourceJournal);
  const rows = buildPinPalLegacyRows(snapshot, TIMEZONE_OFFSET_MINUTES);
  const image = await iosImage(rows);

  const target = await freshJournal();
  const result = await importBytes(image, target);

  assert.strictEqual(result.dialect, 'ios');
  assert.deepStrictEqual(result.skipped, NOTHING_SKIPPED);
  assert.deepStrictEqual(await canonicalJournal(target), source);
});

/* -------------------------------------------------------------------------- */
/* T7.2 — one journal, two physical containers, one logical result            */
/* -------------------------------------------------------------------------- */

test('both dialects restore the same logical journal', async () => {
  const sourceJournal = await seedJournal();
  const source = await canonicalJournal(sourceJournal);
  const snapshot = await readJournalBackupData(sourceJournal);
  const rows = buildPinPalLegacyRows(snapshot, TIMEZONE_OFFSET_MINUTES);
  const android = await androidImage(rows);
  const ios = await iosImage(rows);

  const androidJournal = await freshJournal();
  const androidResult = await importBytes(android, androidJournal);
  const androidData = await readJournalBackupData(androidJournal);
  const androidView = await canonicalJournal(androidJournal);

  const iosJournal = await freshJournal();
  const iosResult = await importBytes(ios, iosJournal);
  const iosData = await readJournalBackupData(iosJournal);
  const iosView = await canonicalJournal(iosJournal);

  assert.strictEqual(androidResult.dialect, 'android');
  assert.strictEqual(iosResult.dialect, 'ios');
  assert.deepStrictEqual(androidResult.restored, iosResult.restored);
  assert.deepStrictEqual(androidView, source);
  assert.deepStrictEqual(iosView, source);
  assert.deepStrictEqual(androidView, iosView);

  // The tenth frame's three balls survive both containers, so the bonus
  // encodings agree even though the legacy rows that carry them differ.
  for (const gameNotes of [
    'perfect game',
    'spare game',
    'open game',
    'mixed game',
    'casual game',
  ]) {
    assert.deepEqual(
      tenthRolls(androidData, gameNotes),
      tenthRolls(snapshot, gameNotes)
    );
    assert.deepEqual(
      tenthRolls(iosData, gameNotes),
      tenthRolls(snapshot, gameNotes)
    );
  }
});

/* -------------------------------------------------------------------------- */
/* T7.3 — stable legacy ids, and an export that writes nothing                */
/* -------------------------------------------------------------------------- */

test('repeated exports of an unchanged journal mint the same legacy ids', async () => {
  const journal = await seedJournal();
  const first = buildPinPalLegacyRows(
    await readJournalBackupData(journal),
    TIMEZONE_OFFSET_MINUTES
  );
  const second = buildPinPalLegacyRows(
    await readJournalBackupData(journal),
    TIMEZONE_OFFSET_MINUTES
  );

  assert.deepStrictEqual(second, first);

  const keys = legacyKeys(first);

  assert.deepEqual(keys.houses, [1, 2]);
  assert.deepEqual(keys.patterns, [1, 2]);
  assert.deepEqual(keys.balls, [1, 2]);
  assert.deepEqual(keys.leagues, [1, 2]);
  assert.deepEqual(keys.weeks, [1, 2, 3]);
  assert.deepEqual(keys.games, [1, 2, 3, 4, 5]);
  assert.deepEqual(keys.frames, range(1, 60));

  const again = await androidImage(second);

  assert.deepStrictEqual(
    Buffer.from(again),
    Buffer.from(await androidImage(first))
  );
});

test('export writes nothing: the journal keeps every entity it held', async () => {
  const journal = await seedJournal();
  const journalName = await journalDatabaseName();
  const before = await readJournalBackupData(journal);
  const beforeView = await canonicalJournal(journal);
  const openedBefore = (await openedDatabaseNames()).length;

  const rows = buildPinPalLegacyRows(before, TIMEZONE_OFFSET_MINUTES);
  const android = await androidImage(rows);
  const ios = await iosImage(rows);

  const opened = (await openedDatabaseNames()).slice(openedBefore);

  assert.deepEqual(opened, [BACKUP_DATABASE_NAME, BACKUP_DATABASE_NAME]);
  assert.strictEqual(opened.includes(journalName), false);

  assert.deepStrictEqual(await readJournalBackupData(journal), before);
  assert.deepStrictEqual(await canonicalJournal(journal), beforeView);

  const target = await freshJournal();

  assert.deepStrictEqual(
    (await importBytes(android, target)).restored,
    (await importBytes(ios, await freshJournal())).restored
  );
});

/* -------------------------------------------------------------------------- */
/* T7.4 — the losses, named rather than smoothed over                         */
/* -------------------------------------------------------------------------- */

test('the round trip names the fields the legacy format cannot carry', async () => {
  const sourceJournal = await seedJournal();
  const snapshot = await readJournalBackupData(sourceJournal);
  const rows = buildPinPalLegacyRows(snapshot, TIMEZONE_OFFSET_MINUTES);
  const android = await androidImage(rows);
  const ios = await iosImage(rows);

  const androidJournal = await freshJournal();
  await importBytes(android, androidJournal);
  const androidData = await readJournalBackupData(androidJournal);

  const iosJournal = await freshJournal();
  await importBytes(ios, iosJournal);
  const iosData = await readJournalBackupData(iosJournal);

  // The journal holds values no legacy table declares a column for.
  assert.strictEqual(
    snapshot.houses.some((house) => (house.location ?? null) !== null),
    true
  );
  assert.strictEqual(
    snapshot.patterns.some((pattern) => (pattern.length ?? null) !== null),
    true
  );
  assert.strictEqual(
    snapshot.balls.some((ball) => (ball.brand ?? null) !== null),
    true
  );
  assert.strictEqual(
    snapshot.leagues.some((league) => (league.startDate ?? null) !== null),
    true
  );
  assert.strictEqual(
    snapshot.sessions.some((session) => (session.weekNumber ?? null) !== null),
    true
  );
  assert.strictEqual(
    snapshot.games.some((game) => (game.handicap ?? null) !== null),
    true
  );
  assert.strictEqual(
    snapshot.games.some((game) => (game.ballSwitches ?? null) !== null),
    true
  );
  assert.strictEqual(
    snapshot.sessions.some((session) => (session.laneContext ?? null) !== null),
    true
  );

  // They come back absent, in both dialects.
  assert.deepEqual(
    androidData.houses.map((house) => house.location ?? null),
    [null, null]
  );
  assert.deepEqual(
    androidData.patterns.map((pattern) => pattern.length ?? null),
    [null, null]
  );
  assert.deepEqual(
    androidData.balls.map((ball) => ball.brand ?? null),
    [null, null]
  );
  assert.deepEqual(
    androidData.leagues.map((league) => league.startDate ?? null),
    [null, null]
  );
  assert.deepEqual(
    androidData.sessions.map((session) => session.weekNumber ?? null),
    [null, null, null]
  );
  assert.deepEqual(
    androidData.games.map((game) => game.handicap ?? null),
    [null, null, null, null, null]
  );
  assert.deepEqual(
    androidData.games.map((game) => game.ballSwitches ?? null),
    [null, null, null, null, null]
  );
  assert.deepEqual(
    androidData.sessions.map((session) => session.laneContext ?? null),
    [null, null, null]
  );
  assert.deepEqual(
    androidData.games.map((game) => game.laneContext ?? null),
    [null, null, null, null, null]
  );

  // The iOS `frame` table does not declare the board columns; Android's does.
  const sourceTenth = frameOf(snapshot, 'mixed game', 10);
  const androidTenth = frameOf(androidData, 'mixed game', 10);
  const iosTenth = frameOf(iosData, 'mixed game', 10);

  assert.strictEqual(androidTenth.pocket ?? null, sourceTenth.pocket ?? null);
  assert.strictEqual(
    androidTenth.footBoard ?? null,
    sourceTenth.footBoard ?? null
  );
  assert.strictEqual(
    androidTenth.targetBoard ?? null,
    sourceTenth.targetBoard ?? null
  );
  assert.strictEqual(iosTenth.pocket ?? null, null);
  assert.strictEqual(iosTenth.footBoard ?? null, null);
  assert.strictEqual(iosTenth.targetBoard ?? null, null);

  // A ball's pin count survives; its bit positions do not.
  const sourceThird = frameOf(snapshot, 'mixed game', 3);
  const androidThird = frameOf(androidData, 'mixed game', 3);

  assert.strictEqual(sourceThird.roll1Mask, HIGH_FIVE);
  assert.strictEqual(
    rollCount(androidThird.roll1Mask),
    rollCount(sourceThird.roll1Mask)
  );
  assert.strictEqual(androidThird.roll1Mask, knockedDown(5));

  // The legacy format marks a frame as strike or non-strike, so the
  // journal's own flag values are normalized rather than carried.
  assert.strictEqual(
    snapshot.frames.some((frame) => (frame.flags ?? null) === 1),
    true
  );
  assert.ok(
    androidData.frames.every(
      (frame) =>
        frame.flags === PINPAL_STRIKE_FRAME_FLAG ||
        frame.flags === PINPAL_NON_STRIKE_FRAME_FLAG
    ),
    'every restored frame flag is the legacy strike or non-strike value'
  );
});

test('an unfinished frame comes back as the legacy gutter ball', async () => {
  const journal = await seedInProgressJournal();
  const before = await readJournalBackupData(journal);

  const rows = buildPinPalLegacyRows(before, TIMEZONE_OFFSET_MINUTES);
  const image = await androidImage(rows);

  const inProgress = gameOf(before, 'in progress');
  const beforeInProgress = one(
    await journal.getGameScore(inProgress.id),
    'in-progress score'
  );
  const spare = gameOf(before, 'spare tenth');
  const beforeSpare = one(
    await journal.getGameScore(spare.id),
    'spare-tenth score'
  );

  const target = await freshJournal();
  await importBytes(image, target);

  const after = await readJournalBackupData(target);
  const afterInProgress = one(
    await target.getGameScore(gameOf(after, 'in progress').id),
    'restored in-progress score'
  );

  assert.strictEqual(
    rollCount(frameOf(before, 'in progress', 2).roll2Mask),
    null
  );
  assert.strictEqual(rollCount(frameOf(after, 'in progress', 2).roll2Mask), 0);
  assert.strictEqual(afterInProgress.totalScore, beforeInProgress.totalScore);
  assert.strictEqual(beforeInProgress.settledRunningTotals[1], null);
  assert.notStrictEqual(afterInProgress.settledRunningTotals[1], null);

  const afterSpare = one(
    await target.getGameScore(gameOf(after, 'spare tenth').id),
    'restored spare-tenth score'
  );

  assert.strictEqual(
    rollCount(frameOf(before, 'spare tenth', 10).roll3Mask),
    null
  );
  assert.strictEqual(rollCount(frameOf(after, 'spare tenth', 10).roll3Mask), 0);
  assert.strictEqual(afterSpare.totalScore, beforeSpare.totalScore);
  assert.strictEqual(beforeSpare.frameScores[9], null);
  assert.notStrictEqual(afterSpare.frameScores[9], null);

  const beforeCount = before.frames.filter(
    (frame) => frame.gameId === inProgress.id
  ).length;
  const afterCount = after.frames.filter(
    (frame) => frame.gameId === gameOf(after, 'in progress').id
  ).length;

  assert.strictEqual(afterCount, beforeCount);
});
