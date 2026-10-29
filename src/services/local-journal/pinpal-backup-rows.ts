/**
 * C-4 T1 — the shared PinPal row converter (pure, app-side).
 *
 * PinPal backups are SQLite images, and PinPal reads a schema that shares
 * zero column names with the canonical local journal (`src/db/schema.ts`:
 * UUID TEXT keys, per-frame roll masks, `session` instead of `week`). This
 * module is the single place that turns a canonical journal snapshot into
 * the seven legacy PinPal entity tables, so both dialect writers — the raw
 * SQLite/`_id` dialect for Android and the plist-wrapped/`pk` dialect for
 * iOS — serialize the SAME rows and differ only in container and columns.
 *
 * ## What this module deliberately is not
 *
 * It opens no database, touches no file system, reads no clock or timezone,
 * makes no network request, and mutates nothing: the snapshot is only read.
 * Building the SQLite image (DDL, `PRAGMA user_version`, page size, the iOS
 * plist wrapper), choosing the dialect from the device the export runs on,
 * and writing the bytes all belong to the dialect writers.
 *
 * ## The legacy row contract (fixture-derived)
 *
 * Every rule below is measured against the captain's real PinPal backups —
 * `fixtures/pinpal/cortez-android.pinpal` (raw SQLite) and
 * `fixtures/pinpal/tj-ios.pinpal` (plist-wrapped) — and agrees with the
 * server-side exporter's row builders (`convex/exports.ts:540-676` plus the
 * pure codec `convex/lib/sqlite_export_frame_encoding.ts`), the only code in
 * this repo that has ever emitted a PinPal-shaped image. Fixture percentages
 * are quoted where a rule is a majority rather than a universal.
 *
 * - **Integer keys.** PinPal's `_id`/`pk` keys have no local equivalent, so
 *   each table mints fresh integers (1-based) in snapshot order. The journal
 *   service lists every table in a stable order, so two exports of an
 *   unchanged journal mint identical keys and every `…Fk` resolves through
 *   the same map.
 * - **Foreign keys.** An absent reference is `0`, never null: neither
 *   fixture contains a null FK, and all 448 Android `week.patternFk` values
 *   are 0 while its `pattern` table has no rows at all. A session with no
 *   league is open bowling, whose legacy league key is `-1` — the exporter's
 *   rule (`convex/exports.ts:588`) and 65/448 `week.leagueFk` values in the
 *   Android fixture.
 * - **One week per session.** The journal has no `week` entity; the captain
 *   chose one PinPal week per local session.
 * - **Dates.** `week.date` is epoch milliseconds of LOCAL midnight: the
 *   journal's ISO date parsed as UTC midnight plus a caller-supplied
 *   `timezoneOffsetMinutes`. That is the rule already approved in
 *   `ROADMAP.md:128` and implemented at `worker/src/sqlite_exporter.js:191-193`.
 *   The offset is an argument, never `new Date().getTimezoneOffset()`, so the
 *   conversion stays deterministic and testable; the iOS writer divides by
 *   1000 for the epoch seconds its own fixture stores.
 * - **No value ⇒ NULL.** `sortOrder`, `lane` and `singlePinSpareScore` are
 *   NULL: the journal has no equivalent for any of them (`laneContext` is
 *   structured JSON, not the legacy integer lane), and the Android fixture's
 *   `lane` column is NULL in all 448 week and all 1377 game rows.
 * - **Derived values.** `game.score` is the derived game total
 *   (`scoreGameFrames`), `game.frame` is `computeGameFrame` over the game's
 *   started frames, `game.flags` is `frame < 10 ? 2 : 1` (the fixture
 *   majority: 1297/1377 Android and 493/520 iOS rows), `frame.score` is 0 in
 *   every row of both fixtures, `frame.pins` is the standing-pin packing
 *   `standingAfterRoll1 | (standingAfterRoll2 << 10)`, and `frame.scores` is
 *   `(min(10, roll1 + roll2) << 4) | roll1`, which both fixtures decode
 *   correctly for every row.
 * - **Twelve frame rows per game**, `frameNum` 0-based, one row per slot:
 *   both fixtures hold exactly 12 rows for every one of their 1377 Android
 *   and 520 iOS games, and a game that stopped after two frames pads slots
 *   2-11 rather than trailing them. Unused slots carry `flags` 0 while keeping
 *   the game's own foreign keys. Padded `pins` stays null here because the
 *   fill differs per dialect (`0xFFFFF` Android, `0x3FFFFFF` iOS).
 * - **Tenth-frame bonus-row flags.** The fixtures' majority rule, measured
 *   over every non-placeholder bonus row: 1242/1242 Android and 455/455 iOS
 *   rows agree. A bonus row is `PINPAL_STRIKE_FRAME_FLAG` except for the row
 *   that packs the two bonus balls after a tenth-frame strike whose second
 *   ball left pins standing; that row is `PINPAL_NON_STRIKE_FRAME_FLAG`. The
 *   per-row rule `roll1 === 10 ? 193 : 195` matches only 849/1242 and
 *   286/455 of those rows, so it is not what PinPal writes. The tenth frame's
 *   own row does follow that per-row rule: 1344/1344 Android and 511/512 iOS.
 *
 * The converter is deterministic and platform-independent: the same snapshot
 * and the same offset always produce identical rows in a fixed table and row
 * order.
 */
import { scoreGameFrames } from './game-scoring';
import { validateJournalBackupData } from './journal-backup-format';
import {
  computeGameFrame,
  frameHasSpare,
  packPinsFromRolls,
} from '../../../convex/lib/sqlite_export_frame_encoding';
import {
  getRollValue,
  normalizeDateValue,
} from '../../screens/game-editor/frame-mask-utils';

import type { JournalBackupData } from './journal-backup-format';
import type { Frame, Session, Uuid } from './types';

/** The key PinPal uses for "no reference" in an `…Fk` column. */
export const PINPAL_ABSENT_FOREIGN_KEY = 0;

/**
 * The legacy league key for an open (casual) session. The journal has no
 * open-bowling pseudo-league, so a session with `leagueId = null` maps here.
 */
export const PINPAL_OPEN_BOWLING_LEAGUE_KEY = -1;

/** `frame.flags` for a row whose ball was a strike. */
export const PINPAL_STRIKE_FRAME_FLAG = 193;

/** `frame.flags` for a row whose ball was not a strike. */
export const PINPAL_NON_STRIKE_FRAME_FLAG = 195;

/** `frame.flags` for a padded, unplayed frame slot. */
export const PINPAL_PLACEHOLDER_FRAME_FLAGS = 0;

/**
 * The padded-slot `pins` fill for each dialect. Neither fixture contains a
 * null `pins`, and the two differ only in this fill width (20 bits on Android,
 * 30 on iOS), so the dialect writers own the value and share everything else.
 */
export const PINPAL_PLACEHOLDER_PINS_ANDROID = 1048575;
export const PINPAL_PLACEHOLDER_PINS_IOS = 1073741823;

/** A `house` row. The journal's `location` has no legacy column. */
export interface LegacyHouseRow {
  sqliteId: number;
  name: string | null;
  sortOrder: number | null;
  flags: number | null;
}

/** A `pattern` row. The journal's `length` has no legacy column. */
export interface LegacyPatternRow {
  sqliteId: number;
  name: string | null;
  sortOrder: number | null;
  flags: number | null;
}

/** A `ball` row. The journal's `brand`/`coverstock` have no legacy column. */
export interface LegacyBallRow {
  sqliteId: number;
  name: string | null;
  sortOrder: number | null;
  flags: number | null;
}

/** A `league` row. The journal's league carries no ball or pattern. */
export interface LegacyLeagueRow {
  sqliteId: number;
  ballFk: number;
  patternFk: number;
  houseFk: number;
  name: string | null;
  games: number | null;
  notes: string | null;
  sortOrder: number | null;
  flags: number | null;
}

/** A `week` row — one per journal session. */
export interface LegacyWeekRow {
  sqliteId: number;
  leagueFk: number;
  ballFk: number;
  patternFk: number;
  houseFk: number;
  /** Epoch milliseconds of local midnight, or null when the date is absent. */
  date: number | null;
  notes: string | null;
  lane: number | null;
}

/** A `game` row. */
export interface LegacyGameRow {
  sqliteId: number;
  weekFk: number;
  leagueFk: number;
  ballFk: number;
  patternFk: number;
  houseFk: number;
  score: number | null;
  frame: number | null;
  flags: number | null;
  singlePinSpareScore: number | null;
  notes: string | null;
  lane: number | null;
}

/** A `frame` row — twelve per game, `frameNum` 0 through 11. */
export interface LegacyFrameRow {
  sqliteId: number;
  gameFk: number;
  weekFk: number;
  leagueFk: number;
  ballFk: number;
  frameNum: number;
  /** Packed standing pins, or null for a padded slot (the writer fills it). */
  pins: number | null;
  scores: number | null;
  score: number | null;
  flags: number | null;
  pocket: number | null;
  footBoard: number | null;
  targetBoard: number | null;
}

/** The seven legacy tables, in the order the writers serialize them. */
export interface PinPalLegacyRows {
  houses: LegacyHouseRow[];
  patterns: LegacyPatternRow[];
  balls: LegacyBallRow[];
  leagues: LegacyLeagueRow[];
  weeks: LegacyWeekRow[];
  games: LegacyGameRow[];
  frames: LegacyFrameRow[];
}

/**
 * Mint the legacy integer key for every entity of one table, in snapshot
 * order, starting at 1. The journal service lists each table in a stable
 * order, so unchanged input yields identical keys.
 */
function mintIdMap(entities: { id: Uuid }[]): Map<Uuid, number> {
  const ids = new Map<Uuid, number>();

  for (const entity of entities) {
    if (!ids.has(entity.id)) {
      ids.set(entity.id, ids.size + 1);
    }
  }

  return ids;
}

/** Resolve one journal reference through its table's key map. */
function resolveForeignKey(
  ids: Map<Uuid, number>,
  id: Uuid | null | undefined
): number {
  if (id === null || id === undefined) {
    return PINPAL_ABSENT_FOREIGN_KEY;
  }

  return ids.get(id) ?? PINPAL_ABSENT_FOREIGN_KEY;
}

/**
 * Resolve a league reference. A missing league is an open session, whose
 * legacy key is `-1` rather than the "no reference" 0.
 */
function resolveLeagueKey(
  ids: Map<Uuid, number>,
  id: Uuid | null | undefined
): number {
  if (id === null || id === undefined) {
    return PINPAL_OPEN_BOWLING_LEAGUE_KEY;
  }

  return ids.get(id) ?? PINPAL_ABSENT_FOREIGN_KEY;
}

/**
 * The legacy epoch-millisecond value for a journal date: the ISO date parsed
 * as UTC midnight, shifted by the caller's timezone offset so PinPal sees
 * local midnight of the same calendar day (`ROADMAP.md:128`).
 *
 * @throws when the date is not a parseable ISO date.
 */
function toLocalMidnightEpochMs(
  date: string | null | undefined,
  timezoneOffsetMinutes: number
): number | null {
  if (date === null || date === undefined || date.length === 0) {
    return null;
  }

  const utcMidnight = Date.parse(`${normalizeDateValue(date)}T00:00:00.000Z`);
  if (!Number.isFinite(utcMidnight)) {
    throw new Error(
      `date "${date}" is not a parseable ISO date; cannot encode a PinPal week`
    );
  }

  return utcMidnight + timezoneOffsetMinutes * 60_000;
}

/**
 * The numeric rolls of one journal frame, derived from its authoritative
 * masks. `null` marks a ball that was never thrown.
 */
function frameRolls(frame: Frame): {
  roll1: number | null;
  roll2: number | null;
  roll3: number | null;
} {
  return {
    roll1: getRollValue(frame.roll1Mask ?? null),
    roll2: getRollValue(frame.roll2Mask ?? null),
    roll3: getRollValue(frame.roll3Mask ?? null),
  };
}

/**
 * One legacy frame row for a ball thrown at a fresh rack.
 *
 * `roll2` is the second ball of the same row only when the row packs two
 * balls (the tenth frame's two bonus balls after a strike that left pins
 * standing); otherwise it is 0, which encodes "one ball, then whatever still
 * stands".
 */
function frameRow({
  gameFk,
  weekFk,
  leagueFk,
  ballSqliteIdById,
  ballId,
  frameNum,
  roll1,
  roll2,
  flags,
  pocket,
  footBoard,
  targetBoard,
}: {
  gameFk: number;
  weekFk: number;
  leagueFk: number;
  ballSqliteIdById: Map<Uuid, number>;
  ballId: Uuid | null | undefined;
  frameNum: number;
  roll1: number;
  roll2: number | null;
  flags: number;
  pocket: number | null;
  footBoard: number | null;
  targetBoard: number | null;
}): LegacyFrameRow {
  return {
    sqliteId: 0,
    gameFk,
    weekFk,
    leagueFk,
    ballFk: resolveForeignKey(ballSqliteIdById, ballId),
    frameNum,
    pins: packPinsFromRolls(roll1, roll2 ?? 0),
    scores: computeLegacyFrameScores(roll1, roll2),
    score: 0,
    flags,
    pocket,
    footBoard,
    targetBoard,
  };
}

/**
 * The padded-slot row for an unused frame slot. PinPal always expects twelve
 * rows per game, and both fixtures pad with `flags` 0 while keeping the
 * game's own foreign keys; only the `pins` fill differs per dialect, so it
 * stays null here.
 */
function placeholderFrameRow({
  gameFk,
  weekFk,
  leagueFk,
  frameNum,
}: {
  gameFk: number;
  weekFk: number;
  leagueFk: number;
  frameNum: number;
}): LegacyFrameRow {
  return {
    sqliteId: 0,
    gameFk,
    weekFk,
    leagueFk,
    ballFk: PINPAL_ABSENT_FOREIGN_KEY,
    frameNum,
    pins: null,
    scores: 0,
    score: 0,
    flags: PINPAL_PLACEHOLDER_FRAME_FLAGS,
    pocket: null,
    footBoard: null,
    targetBoard: null,
  };
}

/**
 * `frame.scores`, mirroring the legacy exporter's encoder
 * (`convex/exports.ts:112`): the row's own first ball in the low nibble and
 * the pins cleared by the row's balls, capped at 10, in the high bits.
 *
 * It lives here rather than being imported because `convex/exports.ts` is
 * server-only (`convex/exports.ts:1` imports `./_generated/server`).
 */
function computeLegacyFrameScores(roll1: number, roll2: number | null): number {
  return (Math.min(10, roll1 + (roll2 ?? 0)) << 4) | roll1;
}

/**
 * The twelve legacy frame rows of one game, `frameNum` 0 through 11.
 *
 * Slots 0-8 hold frames 1-9 and slots 9-11 hold the tenth frame plus its
 * bonus balls. A slot with no ball is padded, so a game that never started
 * frame 5 still contributes a row for it — which is what both fixtures show
 * (1377 Android games x 12 rows, 520 iOS games x 12 rows, one row per slot).
 */
function buildLegacyFrameRowsForGame({
  frames,
  gameFk,
  weekFk,
  leagueFk,
  ballSqliteIdById,
}: {
  frames: Frame[];
  gameFk: number;
  weekFk: number;
  leagueFk: number;
  ballSqliteIdById: Map<Uuid, number>;
}): LegacyFrameRow[] {
  const byFrameNumber = new Map<number, Frame>();

  for (const frame of frames) {
    if (frame.frameNumber >= 1 && frame.frameNumber <= 10) {
      byFrameNumber.set(frame.frameNumber, frame);
    }
  }

  const rows: LegacyFrameRow[] = [];

  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    const frame = byFrameNumber.get(frameNumber);
    const rolls = frame ? frameRolls(frame) : null;

    if (!frame || !rolls || rolls.roll1 === null) {
      rows.push(
        placeholderFrameRow({
          gameFk,
          weekFk,
          leagueFk,
          frameNum: frameNumber - 1,
        })
      );
      continue;
    }

    rows.push(
      frameRow({
        gameFk,
        weekFk,
        leagueFk,
        ballSqliteIdById,
        ballId: frame.ballId,
        frameNum: frameNumber - 1,
        roll1: rolls.roll1,
        roll2: rolls.roll2,
        flags:
          rolls.roll1 === 10
            ? PINPAL_STRIKE_FRAME_FLAG
            : PINPAL_NON_STRIKE_FRAME_FLAG,
        pocket: frame.pocket ?? null,
        footBoard: frame.footBoard ?? null,
        targetBoard: frame.targetBoard ?? null,
      })
    );
  }

  rows.push(
    ...buildTenthFrameSlots({
      tenth: byFrameNumber.get(10) ?? null,
      gameFk,
      weekFk,
      leagueFk,
      ballSqliteIdById,
    })
  );

  return rows;
}

/**
 * The tenth frame's three slots: `frameNum` 9 (its first ball), 10 and 11
 * (its bonus balls). After a strike, a second ball that cleared the rack is
 * thrown at a fresh one and gets its own row, as does a third ball; a second
 * ball that left pins standing packs both bonus balls into slot 10. After a
 * spare, the single bonus ball takes slot 10. Any slot with no ball is padded.
 *
 * The flag rule is the fixtures' majority rule (see the module header): the
 * packed two-ball row is the only bonus row PinPal marks as a non-strike.
 */
function buildTenthFrameSlots({
  tenth,
  gameFk,
  weekFk,
  leagueFk,
  ballSqliteIdById,
}: {
  tenth: Frame | null;
  gameFk: number;
  weekFk: number;
  leagueFk: number;
  ballSqliteIdById: Map<Uuid, number>;
}): LegacyFrameRow[] {
  const padded = (frameNum: number) =>
    placeholderFrameRow({ gameFk, weekFk, leagueFk, frameNum });

  const tenthRolls = tenth ? frameRolls(tenth) : null;
  if (!tenth || !tenthRolls || tenthRolls.roll1 === null) {
    return [padded(9), padded(10), padded(11)];
  }

  const roll1 = tenthRolls.roll1;
  const roll2 = tenthRolls.roll2;
  const roll3 = tenthRolls.roll3;

  const slots = [
    frameRow({
      gameFk,
      weekFk,
      leagueFk,
      ballSqliteIdById,
      ballId: tenth.ballId,
      frameNum: 9,
      roll1,
      roll2,
      flags:
        roll1 === 10 ? PINPAL_STRIKE_FRAME_FLAG : PINPAL_NON_STRIKE_FRAME_FLAG,
      pocket: tenth.pocket ?? null,
      footBoard: tenth.footBoard ?? null,
      targetBoard: tenth.targetBoard ?? null,
    }),
  ];

  if (roll1 === 10 && roll2 !== null) {
    if (roll2 === 10) {
      // A second strike: each remaining ball is thrown at a fresh rack, so
      // each gets its own row and both carry the strike flag.
      slots.push(
        frameRow({
          gameFk,
          weekFk,
          leagueFk,
          ballSqliteIdById,
          ballId: null,
          frameNum: 10,
          roll1: roll2,
          roll2: 0,
          flags: PINPAL_STRIKE_FRAME_FLAG,
          pocket: null,
          footBoard: null,
          targetBoard: null,
        })
      );

      slots.push(
        roll3 === null
          ? padded(11)
          : frameRow({
              gameFk,
              weekFk,
              leagueFk,
              ballSqliteIdById,
              ballId: null,
              frameNum: 11,
              roll1: roll3,
              roll2: 0,
              flags: PINPAL_STRIKE_FRAME_FLAG,
              pocket: null,
              footBoard: null,
              targetBoard: null,
            })
      );
    } else {
      // A non-strike second ball leaves pins standing, so PinPal packs both
      // bonus balls into this one row and marks it as a non-strike.
      slots.push(
        frameRow({
          gameFk,
          weekFk,
          leagueFk,
          ballSqliteIdById,
          ballId: null,
          frameNum: 10,
          roll1: roll2,
          roll2: roll3,
          flags: PINPAL_NON_STRIKE_FRAME_FLAG,
          pocket: null,
          footBoard: null,
          targetBoard: null,
        })
      );
      slots.push(padded(11));
    }
  } else if (
    roll3 !== null &&
    frameHasSpare({
      frameNumber: 10,
      roll1,
      roll2,
      roll3,
    })
  ) {
    // A spare's single bonus ball is thrown at a fresh rack.
    slots.push(
      frameRow({
        gameFk,
        weekFk,
        leagueFk,
        ballSqliteIdById,
        ballId: null,
        frameNum: 10,
        roll1: roll3,
        roll2: 0,
        flags: PINPAL_STRIKE_FRAME_FLAG,
        pocket: null,
        footBoard: null,
        targetBoard: null,
      })
    );
    slots.push(padded(11));
  } else {
    slots.push(padded(10));
    slots.push(padded(11));
  }

  return slots;
}

/**
 * Convert a validated journal snapshot into the seven legacy PinPal tables.
 *
 * `timezoneOffsetMinutes` is the caller's `new Date().getTimezoneOffset()`
 * (the minutes to add to local time to reach UTC), supplied rather than read
 * so the conversion stays pure and deterministic.
 *
 * @throws when the snapshot is not internally consistent
 *         (`validateJournalBackupData`) or carries an unparseable date.
 */
export function buildPinPalLegacyRows(
  snapshot: JournalBackupData,
  timezoneOffsetMinutes: number
): PinPalLegacyRows {
  validateJournalBackupData(snapshot);

  const houseSqliteIdById = mintIdMap(snapshot.houses);
  const patternSqliteIdById = mintIdMap(snapshot.patterns);
  const ballSqliteIdById = mintIdMap(snapshot.balls);
  const leagueSqliteIdById = mintIdMap(snapshot.leagues);
  const weekSqliteIdById = mintIdMap(snapshot.sessions);
  const gameSqliteIdById = mintIdMap(snapshot.games);

  const sessionById = new Map<Uuid, Session>();
  for (const session of snapshot.sessions) {
    sessionById.set(session.id, session);
  }

  const framesByGameId = new Map<Uuid, Frame[]>();
  for (const frame of snapshot.frames) {
    const bucket = framesByGameId.get(frame.gameId);
    if (bucket === undefined) {
      framesByGameId.set(frame.gameId, [frame]);
    } else {
      bucket.push(frame);
    }
  }

  const houses = snapshot.houses.map((house) => ({
    sqliteId: houseSqliteIdById.get(house.id) ?? PINPAL_ABSENT_FOREIGN_KEY,
    name: house.name,
    sortOrder: null,
    flags: null,
  }));

  const patterns = snapshot.patterns.map((pattern) => ({
    sqliteId: patternSqliteIdById.get(pattern.id) ?? PINPAL_ABSENT_FOREIGN_KEY,
    name: pattern.name,
    sortOrder: null,
    flags: null,
  }));

  const balls = snapshot.balls.map((ball) => ({
    sqliteId: ballSqliteIdById.get(ball.id) ?? PINPAL_ABSENT_FOREIGN_KEY,
    name: ball.name,
    sortOrder: null,
    flags: null,
  }));

  const leagues = snapshot.leagues.map((league) => ({
    sqliteId: leagueSqliteIdById.get(league.id) ?? PINPAL_ABSENT_FOREIGN_KEY,
    ballFk: PINPAL_ABSENT_FOREIGN_KEY,
    patternFk: PINPAL_ABSENT_FOREIGN_KEY,
    houseFk: resolveForeignKey(houseSqliteIdById, league.houseId),
    name: league.name,
    games: league.gamesPerSession ?? null,
    notes: null,
    sortOrder: null,
    flags: 0,
  }));

  const weeks = snapshot.sessions.map((session) => ({
    sqliteId: weekSqliteIdById.get(session.id) ?? PINPAL_ABSENT_FOREIGN_KEY,
    leagueFk: resolveLeagueKey(leagueSqliteIdById, session.leagueId),
    ballFk: resolveForeignKey(ballSqliteIdById, session.ballId),
    patternFk: resolveForeignKey(patternSqliteIdById, session.patternId),
    houseFk: resolveForeignKey(houseSqliteIdById, session.houseId),
    date: toLocalMidnightEpochMs(session.date, timezoneOffsetMinutes),
    notes: session.notes ?? null,
    lane: null,
  }));

  const games = snapshot.games.map((game) => {
    const gameFrames = framesByGameId.get(game.id) ?? [];
    const session = sessionById.get(game.sessionId);
    const startedFrames: Array<{
      frameNumber: number;
      roll1: number;
      roll2: number | null;
      roll3: number | null;
    }> = [];

    for (const frame of gameFrames) {
      const rolls = frameRolls(frame);
      if (rolls.roll1 !== null) {
        startedFrames.push({
          frameNumber: frame.frameNumber,
          roll1: rolls.roll1,
          roll2: rolls.roll2,
          roll3: rolls.roll3,
        });
      }
    }

    const legacyFrameCount = computeGameFrame(startedFrames);

    return {
      sqliteId: gameSqliteIdById.get(game.id) ?? PINPAL_ABSENT_FOREIGN_KEY,
      weekFk: resolveForeignKey(weekSqliteIdById, game.sessionId),
      leagueFk: resolveLeagueKey(
        leagueSqliteIdById,
        session ? session.leagueId : null
      ),
      ballFk: resolveForeignKey(ballSqliteIdById, game.ballId),
      patternFk: resolveForeignKey(patternSqliteIdById, game.patternId),
      houseFk: resolveForeignKey(houseSqliteIdById, game.houseId),
      score: scoreGameFrames(gameFrames).totalScore,
      frame: legacyFrameCount,
      flags: legacyFrameCount < 10 ? 2 : 1,
      singlePinSpareScore: null,
      notes: game.notes ?? null,
      lane: null,
    };
  });

  const frames: LegacyFrameRow[] = [];
  let frameSqliteId = 0;

  for (const game of snapshot.games) {
    const session = sessionById.get(game.sessionId);

    for (const row of buildLegacyFrameRowsForGame({
      frames: framesByGameId.get(game.id) ?? [],
      gameFk: gameSqliteIdById.get(game.id) ?? PINPAL_ABSENT_FOREIGN_KEY,
      weekFk: resolveForeignKey(weekSqliteIdById, game.sessionId),
      leagueFk: resolveLeagueKey(
        leagueSqliteIdById,
        session ? session.leagueId : null
      ),
      ballSqliteIdById,
    })) {
      frameSqliteId += 1;
      frames.push({ ...row, sqliteId: frameSqliteId });
    }
  }

  return {
    houses,
    patterns,
    balls,
    leagues,
    weeks,
    games,
    frames,
  };
}
