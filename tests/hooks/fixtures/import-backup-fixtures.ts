/**
 * Fixtures for the local-first import tests: one snapshot of the journal,
 * rendered into each file format the document picker can be handed.
 *
 * The PinPal images are produced by the real export dialects over the real
 * legacy-row converter, so the import half is proven against the export half
 * rather than against a hand-written container. The JSON envelope is the
 * format the app no longer ships — the one the local restore genuinely cannot
 * handle — and the last fixture is bytes that are not a backup at all, which
 * is how any other picked file arrives.
 */
import {
  createJournalBackupDocument,
  serializeJournalBackupJson,
} from '../../../src/services/local-journal/journal-backup-format';
import { buildPinPalLegacyRows } from '../../../src/services/local-journal/pinpal-backup-rows';

import type { JournalBackupData } from '../../../src/services/local-journal/journal-backup-format';
import type { PinPalLegacyRows } from '../../../src/services/local-journal/pinpal-backup-rows';

const HOUSE_ID = '11111111-1111-4111-8111-111111111111';
const PATTERN_ID = '22222222-2222-4222-8222-222222222222';
const BALL_ID = '33333333-3333-4333-8333-333333333333';
const LEAGUE_ID = '44444444-4444-4444-8444-444444444444';
const LEAGUE_SESSION_ID = '55555555-5555-4555-8555-555555555555';
const OPEN_SESSION_ID = '66666666-6666-4666-8666-666666666666';
const STRIKE_GAME_ID = '77777777-7777-4777-8777-777777777777';
const SPARE_GAME_ID = '88888888-8888-4888-8888-888888888888';
const OPEN_GAME_ID = '99999999-9999-4999-8999-999999999999';

/** A mask for `count` pins knocked down, matching `getRollValue`'s count. */
function knockedDown(count: number): number {
  return (1 << count) - 1;
}

/**
 * Two league sessions' worth of games plus one open session's game: a strike
 * game, a spare game with a tenth-frame bonus ball, and an open game whose
 * tenth frame stays open.
 */
export function fixtureSnapshot(): JournalBackupData {
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
      ballId: BALL_ID,
    });
  };

  for (const gameId of [STRIKE_GAME_ID, SPARE_GAME_ID, OPEN_GAME_ID]) {
    for (let frameNumber = 1; frameNumber <= 9; frameNumber += 1) {
      push(gameId, frameNumber, 7, 3, null);
    }
  }
  push(STRIKE_GAME_ID, 10, 10, 10, 10);
  push(SPARE_GAME_ID, 10, 7, 3, 4);
  push(OPEN_GAME_ID, 10, 5, 3, null);

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
        id: STRIKE_GAME_ID,
        sessionId: LEAGUE_SESSION_ID,
        date: '2026-03-15',
        houseId: HOUSE_ID,
        ballId: BALL_ID,
        patternId: PATTERN_ID,
        notes: 'strike',
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
        sessionId: OPEN_SESSION_ID,
        date: '2026-03-14',
        notes: 'open',
      },
    ],
    frames,
  };
}

/** The snapshot rendered into each format the picker can be handed, as bytes. */
export async function fixtureFiles(): Promise<{
  androidPinpal: Uint8Array;
  iosPinpal: Uint8Array;
  journalJson: Uint8Array;
  notABackup: Uint8Array;
}> {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);

  return {
    androidPinpal: await writeAndroidImage(rows),
    iosPinpal: await writeIosImage(rows),
    journalJson: new TextEncoder().encode(
      serializeJournalBackupJson(
        createJournalBackupDocument(fixtureSnapshot(), '2026-10-30T00:00:00Z')
      )
    ),
    notABackup: new TextEncoder().encode('not a backup at all'),
  };
}

/**
 * The Android image plus one frame row whose game never came in: the one
 * kind of row the journal cannot place without cascading, so the import is
 * partial and must say so.
 */
export async function partialFixtureFile(): Promise<Uint8Array> {
  const rows = buildPinPalLegacyRows(fixtureSnapshot(), 0);

  return await writeAndroidImage({
    ...rows,
    frames: [
      ...rows.frames,
      {
        ...rows.frames[0],
        sqliteId: 9990,
        gameFk: 9999,
      },
    ],
  });
}

async function writeAndroidImage(rows: PinPalLegacyRows): Promise<Uint8Array> {
  const androidDialect =
    await import('../../../src/hooks/journal/export-backup/android-pinpal-dialect');

  return await androidDialect.buildAndroidPinpalBackupImage(rows);
}

async function writeIosImage(rows: PinPalLegacyRows): Promise<Uint8Array> {
  const iosDialect =
    await import('../../../src/hooks/journal/export-backup/ios-pinpal-dialect');

  return await iosDialect.buildIosPinpalBackupImage(rows);
}
