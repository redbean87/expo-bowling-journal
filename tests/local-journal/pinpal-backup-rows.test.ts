/**
 * C-4 T1 — the shared PinPal row converter
 * (`src/services/local-journal/pinpal-backup-rows.ts`).
 *
 * The suite drives the converter directly (it is pure: no database, no clock,
 * no file system), with a hand-built canonical snapshot whose UUIDs are the
 * real shape but written out so each test can name a row. It pins the
 * fixture-derived legacy contract the captain approved: stable integer keys
 * minted in snapshot order, foreign keys that resolve through those maps
 * (`0` for "no reference", `-1` for an open session's league), week dates as
 * epoch milliseconds of local midnight for a caller-supplied timezone offset,
 * frame values derived from the authoritative roll masks, the tenth-frame
 * bonus encoding (including the flag rule the real PinPal backups show and
 * the per-row `roll1 === 10 ? 193 : 195` rule does not), twelve slot-based
 * frame rows per game, and the derived game score/frame/flags.
 *
 * It also pins what the converter deliberately leaves out: it never reads a
 * clock or a timezone, never mutates the snapshot, and never builds the
 * SQLite image or chooses a dialect — those belong to the dialect writers.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PINPAL_ABSENT_FOREIGN_KEY,
  PINPAL_NON_STRIKE_FRAME_FLAG,
  PINPAL_OPEN_BOWLING_LEAGUE_KEY,
  PINPAL_PLACEHOLDER_FRAME_FLAGS,
  PINPAL_PLACEHOLDER_PINS_ANDROID,
  PINPAL_PLACEHOLDER_PINS_IOS,
  PINPAL_STRIKE_FRAME_FLAG,
  buildPinPalLegacyRows,
} from '../../src/services/local-journal/pinpal-backup-rows';

import type { JournalBackupData } from '../../src/services/local-journal/journal-backup-format';
import type { PinPalLegacyRows } from '../../src/services/local-journal/pinpal-backup-rows';

const ALL_TEN = 0b1111111111;

/** A mask for `count` pins knocked down, matching `getRollValue`'s count. */
function knockedDown(count: number) {
  return (1 << count) - 1;
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
 * A snapshot with one of everything: a league session (house, ball, pattern)
 * carrying a perfect game, an all-spare game and an open game, plus an open
 * session carrying a game that stops after three frames.
 *
 * The tenth frames exercise every bonus encoding: three strikes in the
 * perfect game, a spare plus a bonus ball in the spare game, and an open
 * tenth frame with no bonus ball in the open game.
 */
function fixtureSnapshot(): JournalBackupData {
  const frames: JournalBackupData['frames'] = [];

  const push = (
    gameId: string,
    frameNumber: number,
    roll1: number | null,
    roll2: number | null,
    roll3: number | null
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
    });
  };

  for (let frameNumber = 1; frameNumber <= 10; frameNumber += 1) {
    push(PERFECT_GAME_ID, frameNumber, 10, 10, 10);
  }
  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    push(SPARE_GAME_ID, frameNumber, 7, 3, null);
  }
  push(SPARE_GAME_ID, 10, 7, 3, 4);
  for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
    push(OPEN_GAME_ID, frameNumber, 5, 3, null);
  }
  push(OPEN_GAME_ID, 10, 5, 3, null);
  for (let frameNumber = 1; frameNumber <= 3; frameNumber += 1) {
    push(PARTIAL_GAME_ID, frameNumber, 4, null, null);
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
      },
      {
        id: OPEN_GAME_ID,
        sessionId: LEAGUE_SESSION_ID,
        date: '2026-03-15',
        houseId: HOUSE_ID,
      },
      { id: PARTIAL_GAME_ID, sessionId: OPEN_SESSION_ID, date: '2026-03-14' },
    ],
    frames,
  };
}

/**
 * The twelve legacy frame rows of one game, in slot order.
 *
 * Both fixtures hold exactly one row per `frameNum` 0-11 for every game, so
 * a reader can index a game's rows by slot rather than by position.
 */
function slots(rows: PinPalLegacyRows, gameSqliteId: number) {
  return rows.frames
    .filter((frame) => frame.gameFk === gameSqliteId)
    .sort((left, right) => left.frameNum - right.frameNum);
}

/* -------------------------------------------------------------------------- */
/* T1.1 — determinism, purity, and the empty snapshot                         */
/* -------------------------------------------------------------------------- */

test('an empty snapshot converts to seven empty tables', () => {
  const empty = buildPinPalLegacyRows(
    {
      balls: [],
      houses: [],
      patterns: [],
      leagues: [],
      sessions: [],
      games: [],
      frames: [],
    },
    0
  );

  assert.deepEqual(empty, {
    houses: [],
    patterns: [],
    balls: [],
    leagues: [],
    weeks: [],
    games: [],
    frames: [],
  });
});

test('the converter is deterministic: the same snapshot yields identical rows', () => {
  const first = buildPinPalLegacyRows(fixtureSnapshot(), -120);
  const second = buildPinPalLegacyRows(fixtureSnapshot(), -120);

  assert.deepEqual(first, second);
  assert.equal(
    JSON.stringify(first) === JSON.stringify(second),
    true,
    'the same snapshot serializes to the same text'
  );
});

test('the converter reads no clock or timezone: only the offset argument shifts output', () => {
  const utc = buildPinPalLegacyRows(fixtureSnapshot(), 0);
  const shifted = buildPinPalLegacyRows(fixtureSnapshot(), -120);

  for (let index = 0; index < utc.weeks.length; index += 1) {
    const week = utc.weeks[index];
    const other = shifted.weeks[index];
    if (week.date === null || other.date === null) {
      throw new Error('every fixture session carries a date');
    }
    assert.equal(other.date - week.date, -120 * 60_000);
    assert.deepEqual({ ...week, date: null }, { ...other, date: null });
  }

  // Nothing else can move: no key, no score, no row order.
  assert.deepEqual(
    utc.games.map((game) => ({ ...game, notes: null })),
    shifted.games.map((game) => ({ ...game, notes: null }))
  );
  assert.deepEqual(
    utc.frames.map((frame) => ({ ...frame, pocket: null })),
    shifted.frames.map((frame) => ({ ...frame, pocket: null }))
  );
});

test('the converter never mutates the snapshot it is given', () => {
  const snapshot = fixtureSnapshot();
  const pristine = JSON.parse(JSON.stringify(snapshot));

  const rows = buildPinPalLegacyRows(snapshot, 0);

  assert.deepEqual(snapshot, pristine);
  assert.equal(snapshot.frames.length, 33);

  // The rows are the converter's own objects, never the snapshot's.
  for (const frame of rows.frames) {
    assert.equal('id' in frame, false);
    assert.equal('gameId' in frame, false);
  }
  for (const game of rows.games) {
    assert.equal('sessionId' in game, false);
  }
});

/* -------------------------------------------------------------------------- */
/* T1.2 — integer keys and foreign-key mapping                                */
/* -------------------------------------------------------------------------- */

test('the converter mints integer keys in snapshot order, starting at 1', () => {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);

  assert.deepEqual(
    rows.houses.map((house) => house.sqliteId),
    [1]
  );
  assert.deepEqual(
    rows.patterns.map((pattern) => pattern.sqliteId),
    [1]
  );
  assert.deepEqual(
    rows.balls.map((ball) => ball.sqliteId),
    [1]
  );
  assert.deepEqual(
    rows.leagues.map((league) => league.sqliteId),
    [1]
  );
  assert.deepEqual(
    rows.weeks.map((week) => week.sqliteId),
    [1, 2]
  );
  assert.deepEqual(
    rows.games.map((game) => game.sqliteId),
    [1, 2, 3, 4]
  );

  // Frame keys are minted once per row, in game order, with no gaps.
  assert.equal(rows.frames.length, 48);
  assert.deepEqual(
    rows.frames.map((frame) => frame.sqliteId),
    [...Array(48)].map((unused, index) => index + 1)
  );
});

test('the converter maps journal references onto legacy foreign keys', () => {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);
  const [leagueSession, openSession] = rows.weeks;

  assert.equal(leagueSession.leagueFk, 1);
  assert.equal(leagueSession.ballFk, 1);
  assert.equal(leagueSession.patternFk, 1);
  assert.equal(leagueSession.houseFk, 1);

  // An open session has no league: the legacy key is -1, not the "no
  // reference" 0, and its other references are absent.
  assert.equal(openSession.leagueFk, PINPAL_OPEN_BOWLING_LEAGUE_KEY);
  assert.equal(openSession.ballFk, PINPAL_ABSENT_FOREIGN_KEY);
  assert.equal(openSession.patternFk, PINPAL_ABSENT_FOREIGN_KEY);
  assert.equal(openSession.houseFk, PINPAL_ABSENT_FOREIGN_KEY);

  const [perfect, , open, partial] = rows.games;
  assert.equal(perfect.weekFk, 1);
  assert.equal(perfect.leagueFk, 1);
  assert.equal(perfect.ballFk, 1);
  assert.equal(perfect.patternFk, 1);
  assert.equal(perfect.houseFk, 1);
  assert.equal(open.houseFk, 1);
  assert.equal(partial.weekFk, 2);
  assert.equal(partial.leagueFk, PINPAL_OPEN_BOWLING_LEAGUE_KEY);
  assert.equal(partial.ballFk, PINPAL_ABSENT_FOREIGN_KEY);
  assert.equal(partial.patternFk, PINPAL_ABSENT_FOREIGN_KEY);
  assert.equal(partial.houseFk, PINPAL_ABSENT_FOREIGN_KEY);

  // The league itself carries no ball or pattern in the canonical model.
  const [league] = rows.leagues;
  assert.equal(league.ballFk, PINPAL_ABSENT_FOREIGN_KEY);
  assert.equal(league.patternFk, PINPAL_ABSENT_FOREIGN_KEY);
  assert.equal(league.houseFk, 1);

  // Every frame row carries its game's keys, so a reader can rebuild the
  // game without following a journal UUID.
  for (const frame of slots(rows, 1)) {
    assert.equal(frame.gameFk, 1);
    assert.equal(frame.weekFk, 1);
    assert.equal(frame.leagueFk, 1);
  }
  for (const frame of slots(rows, 4)) {
    assert.equal(frame.gameFk, 4);
    assert.equal(frame.weekFk, 2);
    assert.equal(frame.leagueFk, PINPAL_OPEN_BOWLING_LEAGUE_KEY);
  }
});

/* -------------------------------------------------------------------------- */
/* T1.3 — dates                                                               */
/* -------------------------------------------------------------------------- */

test('a week date is epoch milliseconds of local midnight', () => {
  const shifted = buildPinPalLegacyRows(fixtureSnapshot(), -120);

  // `2026-03-15T00:00:00Z` is the journal's stored UTC-midnight integer
  // (`ROADMAP.md:128`); shifting by the caller's offset gives local midnight.
  assert.equal(
    shifted.weeks[0].date,
    Date.parse('2026-03-15T00:00:00Z') + -120 * 60_000
  );
  assert.equal(
    shifted.weeks[1].date,
    Date.parse('2026-03-14T00:00:00Z') + -120 * 60_000
  );
  assert.equal(shifted.weeks[0].date, 1773525600000);

  const utc = buildPinPalLegacyRows(fixtureSnapshot(), 0);
  assert.equal(utc.weeks[0].date, 1773532800000);
});

test('an unparseable date is refused rather than silently dropped', () => {
  const snapshot = fixtureSnapshot();
  snapshot.sessions[0].date = 'not a date';

  assert.throws(
    () => buildPinPalLegacyRows(snapshot, 0),
    /not a parseable ISO date/
  );
});

/* -------------------------------------------------------------------------- */
/* T1.4 — frame values derived from the authoritative roll masks              */
/* -------------------------------------------------------------------------- */

test('frame pins and scores come from the roll masks, not from stored numbers', () => {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);

  // The all-spare game's first frame: 7 then 3. `pins` is the standing-pin
  // packing (3 standing after ball one, none after ball two) and `scores`
  // is the legacy `(min(10, roll1 + roll2) << 4) | roll1` encoding.
  const spareGameFirst = slots(rows, 2)[0];
  assert.equal(spareGameFirst.frameNum, 0);
  assert.equal(spareGameFirst.pins, 7);
  assert.equal(spareGameFirst.scores, (10 << 4) | 7);
  assert.equal(spareGameFirst.score, 0);
  assert.equal(spareGameFirst.flags, PINPAL_NON_STRIKE_FRAME_FLAG);

  // The open game's first frame: 5 then 3 — 5 standing, then 2 standing.
  const openGameFirst = slots(rows, 3)[0];
  assert.equal(openGameFirst.pins, 31 | (3 << 10));
  assert.equal(openGameFirst.scores, (8 << 4) | 5);
  assert.equal(openGameFirst.flags, PINPAL_NON_STRIKE_FRAME_FLAG);

  // A strike leaves nothing standing, so `pins` is 0 in both fixtures.
  const perfectGameFirst = slots(rows, 1)[0];
  assert.equal(perfectGameFirst.pins, 0);
  assert.equal(perfectGameFirst.scores, (10 << 4) | 10);
  assert.equal(perfectGameFirst.flags, PINPAL_STRIKE_FRAME_FLAG);

  // A frame whose second ball was never thrown still packs a second half.
  const partialGameFirst = slots(rows, 4)[0];
  assert.equal(partialGameFirst.pins, 63 | (63 << 10));
  assert.equal(partialGameFirst.scores, (4 << 4) | 4);
  assert.equal(partialGameFirst.flags, PINPAL_NON_STRIKE_FRAME_FLAG);
});

test('the tenth frame keeps its own row at frameNum 9', () => {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);

  const perfectTenth = slots(rows, 1)[9];
  assert.equal(perfectTenth.frameNum, 9);
  assert.equal(perfectTenth.flags, PINPAL_STRIKE_FRAME_FLAG);

  const openTenth = slots(rows, 3)[9];
  assert.equal(openTenth.frameNum, 9);
  assert.equal(openTenth.pins, 31 | (3 << 10));
  assert.equal(openTenth.scores, (8 << 4) | 5);
  assert.equal(openTenth.flags, PINPAL_NON_STRIKE_FRAME_FLAG);
});

test('the converter encodes tenth-frame bonus rows the way the fixtures do', () => {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);

  // Three strikes: the tenth frame's own row, then one row per bonus ball,
  // each thrown at a fresh rack and each flagged as a strike.
  const perfect = slots(rows, 1);
  assert.equal(perfect.length, 12);
  for (const index of [9, 10, 11]) {
    assert.equal(perfect[index].frameNum, index);
    assert.equal(perfect[index].flags, PINPAL_STRIKE_FRAME_FLAG);
    assert.equal(perfect[index].pins, 0);
    assert.equal(perfect[index].scores, (10 << 4) | 10);
  }
  assert.equal(perfect[10].ballFk, PINPAL_ABSENT_FOREIGN_KEY);
  assert.equal(perfect[11].ballFk, PINPAL_ABSENT_FOREIGN_KEY);

  // A tenth-frame spare: the bonus ball gets its own row at frameNum 10,
  // flagged as a strike, and frameNum 11 stays a padded slot.
  const spare = slots(rows, 2);
  assert.equal(spare.length, 12);
  assert.equal(spare[10].frameNum, 10);
  assert.equal(spare[10].flags, PINPAL_STRIKE_FRAME_FLAG);
  assert.equal(spare[10].pins, 63 | (63 << 10));
  assert.equal(spare[10].scores, (4 << 4) | 4);
  assert.equal(spare[11].flags, PINPAL_PLACEHOLDER_FRAME_FLAGS);
  assert.equal(spare[11].pins, null);
  assert.equal(spare[11].scores, 0);

  // An open tenth frame gets no bonus rows at all: both slots are padded.
  const open = slots(rows, 3);
  assert.equal(open.length, 12);
  for (const index of [10, 11]) {
    assert.equal(open[index].frameNum, index);
    assert.equal(open[index].flags, PINPAL_PLACEHOLDER_FRAME_FLAGS);
    assert.equal(open[index].pins, null);
    assert.equal(open[index].scores, 0);
    assert.equal(open[index].ballFk, PINPAL_ABSENT_FOREIGN_KEY);
  }

  // A tenth-frame strike whose second ball left pins standing is the one
  // shape the fixtures flag as a non-strike: both bonus balls share slot 10,
  // and slot 11 stays padded.
  const packed = buildPinPalLegacyRows(
    {
      balls: [],
      houses: [],
      patterns: [],
      leagues: [],
      sessions: [{ id: OPEN_SESSION_ID, leagueId: null, date: '2026-03-14' }],
      games: [
        { id: PARTIAL_GAME_ID, sessionId: OPEN_SESSION_ID, date: '2026-03-14' },
      ],
      frames: [
        {
          id: 'bbbbbbbb-0000-4000-8000-000000000010',
          gameId: PARTIAL_GAME_ID,
          frameNumber: 10,
          roll1Mask: ALL_TEN,
          roll2Mask: knockedDown(6),
          roll3Mask: knockedDown(3),
        },
      ],
    },
    0
  );

  const tenth = slots(packed, 1);
  assert.equal(tenth.length, 12);
  assert.equal(tenth[9].frameNum, 9);
  assert.equal(tenth[9].flags, PINPAL_STRIKE_FRAME_FLAG);
  assert.equal(tenth[10].frameNum, 10);
  assert.equal(tenth[10].flags, PINPAL_NON_STRIKE_FRAME_FLAG);
  assert.equal(tenth[10].pins, 15 | (1 << 10));
  assert.equal(tenth[10].scores, (9 << 4) | 6);
  assert.equal(tenth[11].frameNum, 11);
  assert.equal(tenth[11].flags, PINPAL_PLACEHOLDER_FRAME_FLAGS);
});

test('every game converts to exactly twelve slot-based frame rows', () => {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);

  for (const game of rows.games) {
    const gameRows = slots(rows, game.sqliteId);
    assert.equal(gameRows.length, 12);
    assert.deepEqual(
      gameRows.map((frame) => frame.frameNum),
      [...Array(12)].map((unused, index) => index)
    );
  }

  // Padded slots keep the game's own keys and stay flag-zero, which is how
  // PinPal distinguishes an unplayed slot from a thrown ball.
  const partial = slots(rows, 4);
  for (const frame of partial.slice(3)) {
    assert.equal(frame.flags, PINPAL_PLACEHOLDER_FRAME_FLAGS);
    assert.equal(frame.pins, null);
    assert.equal(frame.gameFk, 4);
    assert.equal(frame.weekFk, 2);
    assert.equal(frame.leagueFk, PINPAL_OPEN_BOWLING_LEAGUE_KEY);
  }

  // The dialect writers own the padded `pins` fill; the converter leaves it
  // null so both dialects can share one row set.
  assert.equal(
    rows.frames.filter((frame) => frame.pins === null).length,
    1 + 2 + 9
  );
  assert.notEqual(PINPAL_PLACEHOLDER_PINS_ANDROID, PINPAL_PLACEHOLDER_PINS_IOS);
});

/* -------------------------------------------------------------------------- */
/* T1.5 — derived game values                                                 */
/* -------------------------------------------------------------------------- */

test('game score, frame and flags are derived from the frames', () => {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);
  const [perfect, spare, open, partial] = rows.games;

  assert.equal(perfect.score, 300);
  assert.equal(perfect.frame, 12);
  assert.equal(perfect.flags, 1);

  assert.equal(spare.score, 167);
  assert.equal(spare.frame, 11);
  assert.equal(spare.flags, 1);

  assert.equal(open.score, 80);
  assert.equal(open.frame, 10);
  assert.equal(open.flags, 1);

  assert.equal(partial.score, 12);
  assert.equal(partial.frame, 3);
  assert.equal(partial.flags, 2);
});

test('the converter leaves the columns the journal cannot supply as null', () => {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);

  for (const week of rows.weeks) {
    assert.equal(week.lane, null);
  }
  for (const game of rows.games) {
    assert.equal(game.lane, null);
    assert.equal(game.singlePinSpareScore, null);
  }
  for (const house of rows.houses) {
    assert.equal(house.sortOrder, null);
    assert.equal(house.flags, null);
  }
  for (const frame of rows.frames) {
    assert.equal(frame.pocket, null);
    assert.equal(frame.footBoard, null);
    assert.equal(frame.targetBoard, null);
  }

  // The journal's own text survives: notes come from the snapshot.
  assert.equal(rows.weeks[0].notes, 'week 2');
  assert.equal(rows.weeks[1].notes, null);
  assert.equal(rows.games[0].notes, 'perfect');
  assert.equal(rows.leagues[0].name, 'Thursday Night');
  assert.equal(rows.leagues[0].games, 3);
});

/* -------------------------------------------------------------------------- */
/* T1.6 — refusals                                                            */
/* -------------------------------------------------------------------------- */

test('the converter refuses a snapshot with a broken relationship', () => {
  const snapshot = fixtureSnapshot();
  snapshot.games[0].sessionId = '00000000-0000-4000-8000-000000000000';

  assert.throws(() => buildPinPalLegacyRows(snapshot, 0), /references session/);

  assert.throws(
    () =>
      buildPinPalLegacyRows(
        {
          ...fixtureSnapshot(),
          frames: [
            ...fixtureSnapshot().frames,
            {
              id: 'cccccccc-0000-4000-8000-000000000001',
              gameId: 'dddddddd-0000-4000-8000-000000000002',
              frameNumber: 1,
            },
          ],
        },
        0
      ),
    /references game/
  );
});

test('the converter builds no SQLite image and chooses no dialect', () => {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);

  // The row set is dialect-neutral: it carries both placeholder fills only
  // as exported constants, and no row names a dialect.
  assert.deepEqual(Object.keys(rows), [
    'houses',
    'patterns',
    'balls',
    'leagues',
    'weeks',
    'games',
    'frames',
  ]);
  assert.deepEqual(Object.keys(rows.frames[0]), [
    'sqliteId',
    'gameFk',
    'weekFk',
    'leagueFk',
    'ballFk',
    'frameNum',
    'pins',
    'scores',
    'score',
    'flags',
    'pocket',
    'footBoard',
    'targetBoard',
  ]);
});
