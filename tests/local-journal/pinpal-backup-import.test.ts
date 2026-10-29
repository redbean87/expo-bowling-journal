/**
 * C-4 T5 — local import and restoration for both PinPal `.db` dialects
 * (`src/services/local-journal/pinpal-backup-import.ts`).
 *
 * The suite drives the REAL importer with `expo-sqlite` remapped to
 * `./stubs/pinpal-import-expo-sqlite-stub.mjs`, a `node:sqlite`-backed stub
 * that implements expo-sqlite's `deserializeDatabaseAsync()` seam by writing
 * the image it was handed to its own temp file and opening it — the same bytes,
 * the same header, and the same "file is not a database" failure a truncated
 * image produces on a device. The images themselves come from the two real
 * dialect writers (T2's Android container and T3's iOS compound container),
 * fed with the real T1 converter, so the suite proves the import half against
 * the export half rather than against a hand-written fixture.
 *
 * Covered: both containers are accepted and named — raw SQLite at offset zero
 * as Android, SQLite at offset 4096 behind the plist wrapper as iOS — and a
 * container that disagrees with the key layout is rejected; the two legacy
 * schemas map into the canonical journal without a schema migration, with the
 * iOS table's missing columns (`sortOrder`, `lane`, `pocket`, `footBoard`,
 * `targetBoard`) read as absent rather than assumed; integer keys and `…Fk`
 * foreign keys remap onto fresh local UUIDs, with `0` meaning "no reference"
 * and `-1` an open session's league; `week.date` round-trips through both
 * units (epoch milliseconds on Android, epoch seconds on iOS) to the same
 * local-midnight ISO date; packed pins decode to the journal's roll masks and
 * the tenth frame's bonus slots rebuild in both dialects; a re-export of the
 * imported data reproduces the legacy rows the writers were given; invalid,
 * truncated and hybrid files fail before a single journal write happens; and
 * restoration is additive — an import never edits or removes an entity the
 * journal already holds, and importing twice brings in two copies.
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  createJournalBackupDocument,
  serializeJournalBackupJson,
} from '../../src/services/local-journal/journal-backup-format';
import {
  PINPAL_ABSENT_FOREIGN_KEY,
  PINPAL_NON_STRIKE_FRAME_FLAG,
  PINPAL_OPEN_BOWLING_LEAGUE_KEY,
  PINPAL_PLACEHOLDER_FRAME_FLAGS,
  PINPAL_STRIKE_FRAME_FLAG,
  buildPinPalLegacyRows,
} from '../../src/services/local-journal/pinpal-backup-rows';
import { registerStubRemaps } from '../harness/remap';

import type { JournalBackupData } from '../../src/services/local-journal/journal-backup-format';
import type { PinpalBackupImage } from '../../src/services/local-journal/pinpal-backup-import';
import type { PinpalConversionReport } from '../../src/services/local-journal/pinpal-backup-import';
import type { PinpalImportResult } from '../../src/services/local-journal/pinpal-backup-import';
import type { PinpalRestoredCounts } from '../../src/services/local-journal/pinpal-backup-import';
import type { PinPalLegacyRows } from '../../src/services/local-journal/pinpal-backup-rows';
import type { LegacyBallRow } from '../../src/services/local-journal/pinpal-backup-rows';
import type { LegacyFrameRow } from '../../src/services/local-journal/pinpal-backup-rows';
import type { LegacyGameRow } from '../../src/services/local-journal/pinpal-backup-rows';
import type { LegacyLeagueRow } from '../../src/services/local-journal/pinpal-backup-rows';
import type { LegacyWeekRow } from '../../src/services/local-journal/pinpal-backup-rows';

type DatabaseModule = typeof import('../../src/db/database');
type ServiceModule =
  typeof import('../../src/services/local-journal/sqlite-local-journal-service');
type Journal = InstanceType<ServiceModule['SqliteLocalJournalService']>;

/**
 * The importer is loaded dynamically, the way the journal's own test loads
 * `src/db/database`: the module statically imports `deserializeDatabaseAsync`
 * from `expo-sqlite`, and that specifier can only be remapped once this file's
 * hooks are registered — which happens after this file's own static imports.
 */
type PinpalImportModule =
  typeof import('../../src/services/local-journal/pinpal-backup-import');

async function pinpalModule(): Promise<PinpalImportModule> {
  return (await import('../../src/services/local-journal/pinpal-backup-import')) as PinpalImportModule;
}

async function readPinPalBackupImage(
  bytes: Uint8Array
): Promise<PinpalBackupImage> {
  return (await pinpalModule()).readPinPalBackupImage(bytes);
}

async function convertPinPalBackupRowsToJournalBackupData(
  rows: PinPalLegacyRows,
  timezoneOffsetMinutes: number
): Promise<PinpalConversionReport> {
  return (await pinpalModule()).convertPinPalBackupRowsToJournalBackupData(
    rows,
    timezoneOffsetMinutes
  );
}

async function restoreJournalBackupData(
  service: Journal,
  data: JournalBackupData
): Promise<PinpalRestoredCounts> {
  return (await pinpalModule()).restoreJournalBackupData(service, data);
}

async function importPinPalBackupIntoJournal(
  bytes: Uint8Array,
  service: Journal,
  timezoneOffsetMinutes: number
): Promise<PinpalImportResult> {
  return (await pinpalModule()).importPinPalBackupIntoJournal(
    bytes,
    service,
    timezoneOffsetMinutes
  );
}

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

/** The ten standing pins, the mask a knocked-down count rebuilds. */
const ALL_TEN = 0b1111111111;

/** A mask for `count` pins knocked down, matching `getRollValue`'s count. */
function knockedDown(count: number) {
  return (1 << count) - 1;
}

/**
 * The pin count a roll mask carries.
 *
 * The legacy format packs standing-pin masks, and the encoder picks which
 * pins stand — so a round trip preserves each ball's count, not the original
 * bit positions. This is the value both halves agree on.
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

/**
 * The offset the export hook passes on the way out (`new Date().getTimezoneOffset()`
 * on a UTC+2 device), supplied here so the suite never reads a clock: the
 * importer applies it in reverse, and both halves must agree.
 */
const TIMEZONE_OFFSET_MINUTES = -120;

/** Where the SQLite image sits in each dialect's container. */
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'ascii');
const IOS_COMPOUND_SQLITE_OFFSET = 4096;

/** The counts one import brings in, the snapshot's own shape. */
const EXPECTED_RESTORED = {
  houses: 1,
  patterns: 1,
  balls: 1,
  leagues: 1,
  sessions: 2,
  games: 4,
  frames: 33,
};

/** Nothing in this file is unimportable. */
const EXPECTED_SKIPPED = {
  houses: 0,
  patterns: 0,
  balls: 0,
  leagues: 0,
  weeks: 0,
  games: 0,
  frames: 0,
};

/** Unwrap a lookup the file should have carried. */
function one<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${label} is missing from the imported data`);
  }

  return value;
}

const HOUSE_ID = '11111111-1111-4111-8111-111111111111';
const PATTERN_ID = '22222222-2222-4222-8222-222222222222';
const BALL_ID = '33333333-3333-4333-8333-333333333333';
const LEAGUE_ID = '44444444-4444-4444-8444-444444444444';
const LEAGUE_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const OPEN_SESSION_ID = '66666666-6666-4666-8666-666666666666';
const PERFECT_GAME_ID = '77777777-7777-4777-8777-777777777777';
const SPARE_GAME_ID = '88888888-8888-4888-8888-888888888888';
const OPEN_GAME_ID = '99999999-9999-4999-8999-999999999999';
const PARTIAL_GAME_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/**
 * A snapshot with one of every encoding the legacy format carries: a league
 * session carrying a perfect game (three strikes in the tenth), an all-spare
 * game with a bonus ball, an open game with an open tenth, and an open
 * session (no league) carrying a game that stopped after three frames.
 *
 * The tenth frames exercise every bonus encoding, and the partial game's
 * frames carry an explicit zero second ball — the legacy format packs "one
 * ball, then whatever stands" and "second ball, zero pins" identically, so a
 * frame that really did throw a gutter ball is the only one that round-trips.
 *
 * The spare and open games carry board columns (`pocket`, `footBoard`,
 * `targetBoard`) so the Android dialect's wider `frame` table is visible; the
 * iOS dialect's table does not declare those columns and must read them back
 * as absent rather than as zero.
 */
function fixtureSnapshot(): JournalBackupData {
  const frames: JournalBackupData['frames'] = [];

  const push = (
    gameId: string,
    frameNumber: number,
    roll1: number | null,
    roll2: number | null,
    roll3: number | null,
    board: number | null
  ) => {
    frames.push({
      id: `${gameId.slice(0, 8)}-0000-4000-8000-${String(frameNumber).padStart(
        12,
        '0'
      )}`,
      gameId,
      frameNumber,
      roll1Mask: roll1 === null ? null : knockedDown(roll1),
      roll2Mask: roll2 === null ? null : knockedDown(roll2),
      roll3Mask: roll3 === null ? null : knockedDown(roll3),
      pocket: board,
      footBoard: board,
      targetBoard: board,
    });
  };

  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    push(PERFECT_GAME_ID, frameNumber, 10, null, null, null);
  }
  push(PERFECT_GAME_ID, 10, 10, 10, 10, 5);
  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    push(SPARE_GAME_ID, frameNumber, 7, 3, null, 20);
  }
  push(SPARE_GAME_ID, 10, 7, 3, 4, 20);
  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    push(OPEN_GAME_ID, frameNumber, 5, 3, null, 20);
  }
  push(OPEN_GAME_ID, 10, 5, 3, null, 20);
  for (let frameNumber = 1; frameNumber <= 3; frameNumber += 1) {
    push(PARTIAL_GAME_ID, frameNumber, 4, 0, null, null);
  }

  return {
    balls: [{ id: BALL_ID, name: 'Zen 25', brand: 'Roto Grip' }],
    houses: [{ id: HOUSE_ID, name: 'Test House', location: 'Springfield' }],
    patterns: [{ id: PATTERN_ID, name: 'Cheetah', length: 41 }],
    leagues: [
      {
        id: LEAGUE_ID,
        name: 'Thursday Night',
        gamesPerSession: 3,
        houseId: HOUSE_ID,
        houseName: 'Test House',
      },
    ],
    sessions: [
      {
        id: LEAGUE_SESSION_ID,
        leagueId: LEAGUE_ID,
        date: '2026-03-15',
        weekNumber: 2,
        houseId: HOUSE_ID,
        ballId: BALL_ID,
        patternId: PATTERN_ID,
        notes: 'week 2',
      },
      { id: OPEN_SESSION_ID, leagueId: null, date: '2026-03-14' },
    ],
    games: [
      {
        id: PERFECT_GAME_ID,
        sessionId: LEAGUE_SESSION_ID,
        date: '2026-03-15',
        houseId: HOUSE_ID,
        ballId: BALL_ID,
        patternId: PATTERN_ID,
        notes: 'perfect',
      },
      {
        id: SPARE_GAME_ID,
        sessionId: LEAGUE_SESSION_ID,
        date: '2026-03-15',
        houseId: HOUSE_ID,
        ballId: BALL_ID,
        patternId: PATTERN_ID,
        notes: 'spare',
      },
      {
        id: OPEN_GAME_ID,
        sessionId: LEAGUE_SESSION_ID,
        date: '2026-03-15',
        houseId: HOUSE_ID,
        notes: 'open',
      },
      {
        id: PARTIAL_GAME_ID,
        sessionId: OPEN_SESSION_ID,
        date: '2026-03-14',
        notes: 'partial',
      },
    ],
    frames,
  };
}

/**
 * The rows as the iOS dialect carries them: the same row set, with the
 * columns its narrower tables do not declare read back as absent.
 */
function iosDialectRows(rows: PinPalLegacyRows): PinPalLegacyRows {
  return {
    ...rows,
    frames: rows.frames.map((frame) => ({
      ...frame,
      pocket: null,
      footBoard: null,
      targetBoard: null,
    })),
  };
}

type AndroidDialectModule =
  typeof import('../../src/hooks/journal/export-backup/android-pinpal-dialect');
type IosDialectModule =
  typeof import('../../src/hooks/journal/export-backup/ios-pinpal-dialect');

/**
 * The rows of the snapshot, written into each dialect's container by the real
 * dialect writers (T2 and T3), so the suite proves the import half against the
 * export half rather than against a hand-written fixture.
 */
async function dialectImages(): Promise<{
  android: Uint8Array;
  ios: Uint8Array;
  rows: PinPalLegacyRows;
}> {
  const rows = buildPinPalLegacyRows(
    fixtureSnapshot(),
    TIMEZONE_OFFSET_MINUTES
  );
  const androidModule =
    (await import('../../src/hooks/journal/export-backup/android-pinpal-dialect')) as AndroidDialectModule;
  const iosModule =
    (await import('../../src/hooks/journal/export-backup/ios-pinpal-dialect')) as IosDialectModule;

  return {
    android: await androidModule.buildAndroidPinpalBackupImage(rows),
    ios: await iosModule.buildIosPinpalBackupImage(rows),
    rows,
  };
}

/** Where the SQLite image starts inside a container, or -1. */
function magicOffset(bytes: Uint8Array): number {
  for (let start = 0; start + SQLITE_MAGIC.length <= bytes.length; start += 1) {
    let matches = true;

    for (let index = 0; index < SQLITE_MAGIC.length; index += 1) {
      if (bytes[start + index] !== SQLITE_MAGIC[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return start;
    }
  }

  return -1;
}

/** A fresh journal, reopened from the stub's own temp-backed database. */
async function freshJournal(): Promise<Journal> {
  const dbModule = (await import('../../src/db/database')) as DatabaseModule;
  const serviceModule =
    (await import('../../src/services/local-journal/sqlite-local-journal-service')) as ServiceModule;

  await dbModule.closeDatabase();
  await dbModule.getDatabase();

  return new serviceModule.SqliteLocalJournalService();
}

/** Every entity the journal holds, counted through the service's own lists. */
async function journalCounts(journal: Journal): Promise<PinpalRestoredCounts> {
  const houses = await journal.listHouses();
  const patterns = await journal.listPatterns();
  const balls = await journal.listBalls();
  const leagues = await journal.listLeagues();
  const sessions = await journal.listSessions();
  const games = await journal.listGames();

  let frames = 0;
  for (const game of games) {
    frames += (await journal.getGameFrames(game.id)).length;
  }

  return {
    houses: houses.length,
    patterns: patterns.length,
    balls: balls.length,
    leagues: leagues.length,
    sessions: sessions.length,
    games: games.length,
    frames,
  };
}

/** An empty journal, as the invalid-input tests expect it. */
const EMPTY_JOURNAL = {
  houses: 0,
  patterns: 0,
  balls: 0,
  leagues: 0,
  sessions: 0,
  games: 0,
  frames: 0,
};

/* -------------------------------------------------------------------------- */
/* T5.1 — both dialects are accepted, and named                               */
/* -------------------------------------------------------------------------- */

test('the raw Android image and the iOS compound image are both accepted', async () => {
  const { android, ios } = await dialectImages();

  assert.strictEqual(magicOffset(android), 0);
  assert.strictEqual(magicOffset(ios), IOS_COMPOUND_SQLITE_OFFSET);

  const androidImage = await readPinPalBackupImage(android);
  const iosImage = await readPinPalBackupImage(ios);

  assert.strictEqual(androidImage.dialect, 'android');
  assert.strictEqual(iosImage.dialect, 'ios');
});

test('a container that disagrees with the key layout is rejected', async () => {
  const { android, ios } = await dialectImages();

  // The iOS image with its plist wrapper removed: a raw container carrying the
  // iOS `pk` layout, which neither device writes.
  await assert.rejects(
    async () =>
      await readPinPalBackupImage(ios.slice(IOS_COMPOUND_SQLITE_OFFSET)),
    /hybrid/
  );

  // The Android image wrapped in 4096 bytes of app state: a compound container
  // carrying the Android `_id` layout.
  const wrapped = new Uint8Array(IOS_COMPOUND_SQLITE_OFFSET + android.length);
  wrapped.set(android, IOS_COMPOUND_SQLITE_OFFSET);

  await assert.rejects(
    async () => await readPinPalBackupImage(wrapped),
    /hybrid/
  );
});

/* -------------------------------------------------------------------------- */
/* T5.2 — the two legacy schemas map into the canonical journal               */
/* -------------------------------------------------------------------------- */

/**
 * Convert one dialect's image and pin the canonical payload it produces.
 *
 * The assertions below are the ones both dialects must satisfy identically:
 * the legacy format is one row vocabulary, and the only difference the two
 * containers carry is where the image sits and which columns exist.
 */
async function convertedOf(
  image: Uint8Array,
  dialect: string
): Promise<PinpalConversionReport> {
  const report = await convertPinPalBackupRowsToJournalBackupData(
    (await readPinPalBackupImage(image)).rows,
    TIMEZONE_OFFSET_MINUTES
  );
  const { data, skipped } = report;

  assert.deepEqual(
    skipped,
    EXPECTED_SKIPPED,
    `the ${dialect} conversion skips nothing`
  );

  assert.strictEqual(
    data.houses.length,
    1,
    `the ${dialect} file has one house`
  );
  assert.strictEqual(data.patterns.length, 1);
  assert.strictEqual(data.balls.length, 1);
  assert.strictEqual(data.leagues.length, 1);
  assert.strictEqual(data.sessions.length, 2);
  assert.strictEqual(data.games.length, 4);
  assert.strictEqual(data.frames.length, 33);

  // The legacy integer keys never reach the journal: every entity carries a
  // fresh UUID, and every reference resolves through the ids this import
  // created rather than through the file's own keys.
  const importedIds = [
    ...data.houses,
    ...data.patterns,
    ...data.balls,
    ...data.leagues,
    ...data.sessions,
    ...data.games,
    ...data.frames,
  ].map((entity) => entity.id);

  assert.equal(new Set(importedIds).size, importedIds.length);
  for (const id of importedIds) {
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  }

  // Foreign keys: `0` means "no reference" and `-1` an open session's
  // league, so the open session comes back with no league while the league
  // session points at the league this import just created.
  const leagueSession = one(
    data.sessions.find((session) => session.notes === 'week 2'),
    'the league session'
  );

  assert.ok(
    data.leagues.some((league) => league.id === leagueSession.leagueId),
    `the ${dialect} league session points at an imported league`
  );
  assert.equal(
    data.sessions.filter((session) => session.leagueId === null).length,
    1
  );

  // Dates: the two dialects store the same local midnight in different
  // units, and both come back as the journal's ISO date.
  assert.deepEqual(data.sessions.map((session) => session.date).sort(), [
    '2026-03-14',
    '2026-03-15',
  ]);

  const perfectGame = one(
    data.games.find((game) => game.notes === 'perfect'),
    'the perfect game'
  );
  const spareGame = one(
    data.games.find((game) => game.notes === 'spare'),
    'the spare game'
  );
  const openGame = one(
    data.games.find((game) => game.notes === 'open'),
    'the open game'
  );

  const tenthOf = (gameId: string) =>
    one(
      data.frames.find(
        (frame) => frame.gameId === gameId && frame.frameNumber === 10
      ),
      `the tenth frame of ${gameId}`
    );

  const perfectTenth = tenthOf(perfectGame.id);
  const spareTenth = tenthOf(spareGame.id);
  const openTenth = tenthOf(openGame.id);

  assert.equal(perfectTenth.roll1Mask, ALL_TEN);
  assert.equal(perfectTenth.roll2Mask, ALL_TEN);
  assert.equal(perfectTenth.roll3Mask, ALL_TEN);
  assert.deepEqual(
    [perfectTenth, spareTenth, openTenth].map((tenth) => [
      rollCount(tenth.roll1Mask),
      rollCount(tenth.roll2Mask),
      rollCount(tenth.roll3Mask),
    ]),
    [
      [10, 10, 10],
      [7, 3, 4],
      [5, 3, null],
    ],
    'the tenth frame and its bonus slots rebuild in both dialects'
  );

  // The tenth frame's own flags survive, and no padded slot comes in.
  assert.equal(perfectTenth.flags, PINPAL_STRIKE_FRAME_FLAG);
  assert.equal(openTenth.flags, PINPAL_NON_STRIKE_FRAME_FLAG);
  assert.ok(
    data.frames.every(
      (frame) => (frame.flags ?? 0) !== PINPAL_PLACEHOLDER_FRAME_FLAGS
    ),
    `no padded slot was imported in the ${dialect} dialect`
  );

  // A strike frame's second mask is absent, never an invented ball.
  const perfectFrames = data.frames.filter(
    (frame) => frame.gameId === perfectGame.id && frame.frameNumber <= 9
  );

  assert.equal(perfectFrames.length, 9);
  assert.equal(
    perfectFrames.filter((frame) => frame.roll2Mask === null).length,
    9
  );

  // The partial game's frames keep their counts, including the zero second
  // ball, and stop at frame 3.
  const partialFrames = data.frames.filter(
    (frame) =>
      frame.gameId ===
      one(
        data.games.find((game) => game.notes === 'partial'),
        'the partial game'
      ).id
  );

  assert.equal(partialFrames.length, 3);
  assert.deepEqual(
    partialFrames.map((frame) => [
      frame.frameNumber,
      rollCount(frame.roll1Mask),
      rollCount(frame.roll2Mask),
      rollCount(frame.roll3Mask),
    ]),
    [
      [1, 4, 0, null],
      [2, 4, 0, null],
      [3, 4, 0, null],
    ]
  );

  return report;
}

test('both dialects convert to the same canonical payload', async () => {
  const { android, ios, rows } = await dialectImages();

  const androidReport = await convertedOf(android, 'android');
  const iosReport = await convertedOf(ios, 'ios');

  // The schema difference is read, not assumed: the Android dialect carries
  // the board columns, the iOS dialect does not.
  const androidBoard = androidReport.data.frames.filter(
    (frame) => frame.pocket !== null
  );
  const iosBoard = iosReport.data.frames.filter(
    (frame) => frame.pocket !== null
  );

  assert.equal(androidBoard.length, 21);
  assert.equal(iosBoard.length, 0);

  // Re-exporting the imported data reproduces the rows the writers were given:
  // the legacy format's own values survive the round trip in both dialects.
  assert.deepEqual(
    buildPinPalLegacyRows(androidReport.data, TIMEZONE_OFFSET_MINUTES),
    rows
  );
  assert.deepEqual(
    buildPinPalLegacyRows(iosReport.data, TIMEZONE_OFFSET_MINUTES),
    iosDialectRows(rows)
  );
});

test('the legacy foreign-key vocabulary maps as the converter writes it', async () => {
  const { android, ios } = await dialectImages();

  const androidRows = (await readPinPalBackupImage(android)).rows;
  const iosRows = (await readPinPalBackupImage(ios)).rows;

  for (const [dialect, rows] of [
    ['android', androidRows],
    ['ios', iosRows],
  ] as Array<[string, PinPalLegacyRows]>) {
    // `-1` is the exporter's open-bowling league key, and exactly one week
    // row of this file uses it.
    assert.equal(
      rows.weeks.filter(
        (week: LegacyWeekRow) =>
          week.leagueFk === PINPAL_OPEN_BOWLING_LEAGUE_KEY
      ).length,
      1,
      `${dialect} open-bowling weeks`
    );

    // `0` means "no reference": the open session's game carries no ball or
    // pattern, and the open game in the league session carries no pattern.
    assert.equal(
      rows.games.filter(
        (game: LegacyGameRow) =>
          game.ballFk === PINPAL_ABSENT_FOREIGN_KEY ||
          game.patternFk === PINPAL_ABSENT_FOREIGN_KEY
      ).length,
      2,
      `${dialect} games with an absent reference`
    );

    const sqliteIds = (rowsIn: { sqliteId: number }[]) =>
      new Set(rowsIn.map((row) => row.sqliteId));

    const gameIds = sqliteIds(rows.games);
    const weekIds = sqliteIds(rows.weeks);
    const leagueIds = sqliteIds(rows.leagues);
    const houseIds = sqliteIds(rows.houses);
    const ballIds = sqliteIds(rows.balls);
    const patternIds = sqliteIds(rows.patterns);

    const resolves = (
      key: number,
      known: Set<number>,
      openBowlingAllowed: boolean
    ) =>
      key === PINPAL_ABSENT_FOREIGN_KEY ||
      (openBowlingAllowed && key === PINPAL_OPEN_BOWLING_LEAGUE_KEY) ||
      known.has(key);

    assert.ok(
      rows.frames.every(
        (frame: LegacyFrameRow) =>
          resolves(frame.gameFk, gameIds, false) &&
          resolves(frame.weekFk, weekIds, false) &&
          resolves(frame.leagueFk, leagueIds, true) &&
          resolves(frame.ballFk, ballIds, true)
      ),
      `${dialect} frame foreign keys resolve`
    );
    assert.ok(
      rows.games.every(
        (game: LegacyGameRow) =>
          resolves(game.weekFk, weekIds, false) &&
          resolves(game.leagueFk, leagueIds, true) &&
          resolves(game.houseFk, houseIds, true) &&
          resolves(game.ballFk, ballIds, true) &&
          resolves(game.patternFk, patternIds, true)
      ),
      `${dialect} game foreign keys resolve`
    );
    assert.ok(
      rows.weeks.every(
        (week: LegacyWeekRow) =>
          resolves(week.leagueFk, leagueIds, true) &&
          resolves(week.houseFk, houseIds, true) &&
          resolves(week.ballFk, ballIds, true) &&
          resolves(week.patternFk, patternIds, true)
      ),
      `${dialect} week foreign keys resolve`
    );
    assert.ok(
      rows.leagues.every(
        (league: LegacyLeagueRow) =>
          resolves(league.houseFk, houseIds, true) &&
          resolves(league.ballFk, ballIds, true) &&
          resolves(league.patternFk, patternIds, true)
      ),
      `${dialect} league foreign keys resolve`
    );

    // A padded slot is the only row with `flags` 0, and the importer never
    // brings one into the journal.
    assert.ok(
      rows.frames.every(
        (frame: LegacyFrameRow) =>
          (frame.flags ?? 0) === PINPAL_PLACEHOLDER_FRAME_FLAGS ||
          frame.flags === PINPAL_STRIKE_FRAME_FLAG ||
          frame.flags === PINPAL_NON_STRIKE_FRAME_FLAG
      ),
      `${dialect} frame flags`
    );
    assert.equal(
      rows.frames.filter(
        (frame: LegacyFrameRow) =>
          (frame.flags ?? 0) === PINPAL_PLACEHOLDER_FRAME_FLAGS
      ).length,
      12,
      `${dialect} padded frame slots`
    );
    assert.equal(
      rows.balls.filter((ball: LegacyBallRow) => !ball.name).length,
      0
    );
  }
});

/* -------------------------------------------------------------------------- */
/* T5.3 — restoration writes the journal, and only adds                       */
/* -------------------------------------------------------------------------- */

test('restoration writes every imported entity through the local service', async () => {
  const { android } = await dialectImages();
  const journal = await freshJournal();
  const report = await convertedOf(android, 'android');

  const restored = await restoreJournalBackupData(journal, report.data);

  assert.deepEqual(restored, EXPECTED_RESTORED);
  assert.deepEqual(await journalCounts(journal), restored);
});

test('import is additive: existing journal data is never edited or removed', async () => {
  const { android } = await dialectImages();
  const journal = await freshJournal();

  const existingHouse = await journal.createHouse({
    name: 'Already Here',
    location: 'Shelbyville',
  });
  const existingSession = await journal.createSession({
    leagueId: null,
    date: '2026-01-04',
  });
  const existingGame = await journal.createGame({
    sessionId: existingSession.id,
    date: '2026-01-04',
    houseId: existingHouse.id,
  });
  await journal.replaceGameFrames(existingGame.id, [
    {
      frameNumber: 1,
      roll1Mask: knockedDown(9),
      roll2Mask: knockedDown(1),
      roll3Mask: null,
    },
    {
      frameNumber: 2,
      roll1Mask: knockedDown(4),
      roll2Mask: null,
      roll3Mask: null,
    },
  ]);

  const before = await journalCounts(journal);
  const beforeFrames = await journal.getGameFrames(existingGame.id);

  const result = await importPinPalBackupIntoJournal(
    android,
    journal,
    TIMEZONE_OFFSET_MINUTES
  );

  assert.strictEqual(result.dialect, 'android');
  assert.deepEqual(result.restored, EXPECTED_RESTORED);
  assert.deepEqual(result.skipped, EXPECTED_SKIPPED);

  const after = await journalCounts(journal);

  assert.deepEqual(after, {
    houses: before.houses + 1,
    patterns: before.patterns + 1,
    balls: before.balls + 1,
    leagues: before.leagues + 1,
    sessions: before.sessions + 2,
    games: before.games + 4,
    frames: before.frames + 33,
  });

  // The entity that was already there is still there, unchanged, and the
  // import never claimed it: the imported house is a second one.
  const houses = await journal.listHouses();

  assert.equal(
    houses.filter((house) => house.name === 'Already Here').length,
    1
  );
  assert.equal(houses.filter((house) => house.name === 'Test House').length, 1);
  assert.equal(
    one(
      houses.find((house) => house.id === existingHouse.id),
      'the house that was already in the journal'
    ).location,
    'Shelbyville'
  );
  assert.deepEqual(await journal.getGameFrames(existingGame.id), beforeFrames);

  // Importing the same file again brings in another copy rather than merging
  // into, or editing, the first.
  const again = await importPinPalBackupIntoJournal(
    android,
    journal,
    TIMEZONE_OFFSET_MINUTES
  );

  assert.deepEqual(again.restored, EXPECTED_RESTORED);
  assert.deepEqual(await journalCounts(journal), {
    houses: after.houses + 1,
    patterns: after.patterns + 1,
    balls: after.balls + 1,
    leagues: after.leagues + 1,
    sessions: after.sessions + 2,
    games: after.games + 4,
    frames: after.frames + 33,
  });
});

/* -------------------------------------------------------------------------- */
/* T5.4 — bad files fail before the journal changes                           */
/* -------------------------------------------------------------------------- */

test('a truncated image fails before any journal write', async () => {
  const { android } = await dialectImages();
  const journal = await freshJournal();

  await assert.rejects(
    async () =>
      await importPinPalBackupIntoJournal(
        android.slice(0, 1000),
        journal,
        TIMEZONE_OFFSET_MINUTES
      ),
    /not a PinPal backup|could not be opened|not a database/i
  );

  assert.deepEqual(await journalCounts(journal), EMPTY_JOURNAL);
});

test('a file that is not a PinPal backup at all fails before any journal write', async () => {
  const journal = await freshJournal();

  // The `.json` envelope the earlier slices wrote: a `.db` extension is not
  // proof of a SQLite file, and this importer must not swallow it.
  const json = Buffer.from(
    serializeJournalBackupJson(
      createJournalBackupDocument(fixtureSnapshot(), '2026-04-01T00:00:00.000Z')
    ),
    'utf8'
  );

  await assert.rejects(
    async () =>
      await importPinPalBackupIntoJournal(
        Uint8Array.from(json),
        journal,
        TIMEZONE_OFFSET_MINUTES
      ),
    /not a PinPal backup/
  );

  assert.deepEqual(await journalCounts(journal), EMPTY_JOURNAL);
});

test('a payload the validator rejects stops before the first write', async () => {
  const journal = await freshJournal();

  // A session that points at a league the payload does not carry.
  await assert.rejects(
    async () =>
      await restoreJournalBackupData(journal, {
        balls: [],
        houses: [],
        patterns: [],
        leagues: [],
        sessions: [
          {
            id: LEAGUE_SESSION_ID,
            leagueId: LEAGUE_ID,
            date: '2026-03-15',
          },
        ],
        games: [],
        frames: [],
      }),
    /unknown|does not|not in the payload/i
  );

  assert.deepEqual(await journalCounts(journal), EMPTY_JOURNAL);
});
