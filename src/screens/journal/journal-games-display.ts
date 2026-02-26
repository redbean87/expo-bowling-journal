import {
  getFrameSplitFlags,
  getFrameSymbolParts,
  getProvisionalTotalScore,
  toFrameDrafts,
} from '../game-editor/game-editor-frame-utils';
import { type QueuedGameSaveEntry } from '../game-editor/game-save-queue';
import { toOldestFirstGames } from '../journal-fast-lane-utils';
import { normalizeGamesPerSession } from '../journal-games-night-summary';
import { reconcileGamesForDisplay } from '../journal-games-reconciliation';

import type { Game } from '@/services/journal';

export type PreviewItem = {
  text: string;
  hasSplit: boolean;
};

type PreviewMarkSummary = {
  strikeMarks: number;
  spareMarks: number;
  openFrames: number;
};

export type DisplayGameItem = {
  key: string;
  date: string;
  routeGameId: string;
  routeDraftNonce: string | null;
  deleteGameId: string | null;
  deleteQueueId: string | null;
  createdAt: number;
  totalScore: number;
  strikes: number;
  spares: number;
  opens: number;
  framePreviewItems: PreviewItem[];
};

export type QueueDerivedGame = {
  queueId: string;
  date: string;
  gameId: string | null;
  draftNonce: string | null;
  createdAt: number;
  totalScore: number;
  strikes: number;
  spares: number;
  opens: number;
  framePreviewItems: PreviewItem[];
};

export type PendingHandoffEntry = {
  queuedGame: QueueDerivedGame;
  expiresAt: number;
};

export type StartEntryTarget = {
  gameId: string;
  draftNonce: string | null;
};

export function normalizeFramePreviewItems(
  framePreview: unknown
): PreviewItem[] {
  if (!Array.isArray(framePreview)) {
    return [];
  }

  return framePreview
    .map((item) => {
      if (typeof item === 'string') {
        return {
          text: item,
          hasSplit: false,
        } satisfies PreviewItem;
      }

      if (
        item !== null &&
        typeof item === 'object' &&
        'text' in item &&
        typeof item.text === 'string'
      ) {
        return {
          text: item.text,
          hasSplit: 'hasSplit' in item ? Boolean(item.hasSplit) : false,
        } satisfies PreviewItem;
      }

      return null;
    })
    .filter((item): item is PreviewItem => item !== null);
}

function summarizePreviewMarks(
  framePreviewItems: PreviewItem[]
): PreviewMarkSummary {
  let strikeMarks = 0;
  let spareMarks = 0;
  let openFrames = 0;

  for (const item of framePreviewItems) {
    const frameText = item.text;
    const compactFrameText = frameText.replace(/\s+/g, '');

    strikeMarks += [...frameText].filter(
      (character) => character === 'X'
    ).length;
    spareMarks += [...frameText].filter(
      (character) => character === '/'
    ).length;

    if (compactFrameText === '' || compactFrameText === '-') {
      continue;
    }

    if (compactFrameText.includes('X') || compactFrameText.includes('/')) {
      continue;
    }

    if (compactFrameText.length >= 2) {
      openFrames += 1;
    }
  }

  return {
    strikeMarks,
    spareMarks,
    openFrames,
  };
}

export function buildQueueDerivedGame(
  entry: QueuedGameSaveEntry
): QueueDerivedGame {
  const frameDrafts = toFrameDrafts(entry.frames);
  const framePreviewItems = frameDrafts
    .map((frame, frameIndex) => {
      const text = getFrameSymbolParts(frameIndex, frame).join(' ');
      const splitFlags = getFrameSplitFlags(frameIndex, frame);

      return {
        text,
        hasSplit: splitFlags.roll1 || splitFlags.roll2 || splitFlags.roll3,
      } satisfies PreviewItem;
    })
    .filter((item) => item.text.trim().length > 0);

  const previewMarks = summarizePreviewMarks(framePreviewItems);
  const totalScore = getProvisionalTotalScore(frameDrafts);

  return {
    queueId: entry.queueId,
    date: entry.date,
    gameId: entry.gameId,
    draftNonce: entry.draftNonce,
    createdAt: entry.createdAt,
    totalScore,
    strikes: previewMarks.strikeMarks,
    spares: previewMarks.spareMarks,
    opens: previewMarks.openFrames,
    framePreviewItems,
  };
}

export function areQueueEntriesEqual(
  left: QueuedGameSaveEntry[],
  right: QueuedGameSaveEntry[]
) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort((a, b) =>
    a.queueId.localeCompare(b.queueId)
  );
  const rightSorted = [...right].sort((a, b) =>
    a.queueId.localeCompare(b.queueId)
  );

  return leftSorted.every((entry, index) => {
    const other = rightSorted[index];

    if (!other) {
      return false;
    }

    return (
      entry.queueId === other.queueId &&
      entry.signature === other.signature &&
      entry.gameId === other.gameId &&
      entry.draftNonce === other.draftNonce &&
      entry.nextRetryAt === other.nextRetryAt &&
      entry.updatedAt === other.updatedAt
    );
  });
}

export function buildStartEntryTarget(
  displayGames: DisplayGameItem[]
): StartEntryTarget {
  const latestGame = [...displayGames].sort(
    (left, right) => right.createdAt - left.createdAt
  )[0];

  if (!latestGame) {
    return {
      gameId: 'new',
      draftNonce: null,
    };
  }

  return {
    gameId: latestGame.routeGameId,
    draftNonce: latestGame.routeDraftNonce,
  };
}

export function buildDisplayNightSummary(
  games: Array<
    Pick<DisplayGameItem, 'totalScore' | 'strikes' | 'spares' | 'opens'>
  >,
  gamesPerSession: number | null | undefined
) {
  const gamesPlayed = games.length;
  const targetGames = normalizeGamesPerSession(gamesPerSession);
  const totalPins = games.reduce((total, game) => total + game.totalScore, 0);
  const strikes = games.reduce((total, game) => total + game.strikes, 0);
  const spares = games.reduce((total, game) => total + game.spares, 0);
  const opens = games.reduce((total, game) => total + game.opens, 0);

  let highGame: number | null = null;
  let lowGame: number | null = null;

  for (const game of games) {
    if (highGame === null || game.totalScore > highGame) {
      highGame = game.totalScore;
    }

    if (lowGame === null || game.totalScore < lowGame) {
      lowGame = game.totalScore;
    }
  }

  const isNightComplete = targetGames !== null && gamesPlayed >= targetGames;
  const remainingGames =
    targetGames === null ? null : Math.max(targetGames - gamesPlayed, 0);

  return {
    gamesPlayed,
    targetGames,
    remainingGames,
    isNightComplete,
    totalPins,
    average: gamesPlayed === 0 ? 0 : totalPins / gamesPlayed,
    highGame,
    lowGame,
    strikes,
    spares,
    opens,
  };
}

export function buildDisplayGamesForScreen({
  games,
  queuedSessionEntries,
  pendingHandoffEntries,
  handoffByQueueId,
  stableCreatedAtByGameId,
}: {
  games: Game[];
  queuedSessionEntries: QueuedGameSaveEntry[];
  pendingHandoffEntries: PendingHandoffEntry[];
  handoffByQueueId: Map<string, string>;
  stableCreatedAtByGameId: Map<string, number>;
}): DisplayGameItem[] {
  const serverGames = toOldestFirstGames(games).map((game) => ({
    id: String(game._id),
    clientSyncId:
      typeof (game as { clientSyncId?: string | null }).clientSyncId ===
        'string' &&
      ((game as { clientSyncId?: string | null }).clientSyncId?.length ?? 0) > 0
        ? ((game as { clientSyncId?: string | null }).clientSyncId ?? null)
        : null,
    date: game.date,
    createdAt: game._creationTime,
    totalScore: game.totalScore,
    strikes: game.strikes,
    spares: game.spares,
    opens: game.opens,
    framePreviewItems: normalizeFramePreviewItems(game.framePreview),
  }));

  const serverGameIds = new Set(serverGames.map((game) => game.id));
  stableCreatedAtByGameId.forEach((_, gameId) => {
    if (!serverGameIds.has(gameId)) {
      stableCreatedAtByGameId.delete(gameId);
    }
  });

  const queuedDerivedGames = queuedSessionEntries.map(buildQueueDerivedGame);
  const activeQueueIds = new Set(
    queuedDerivedGames.map((entry) => entry.queueId)
  );
  const heldQueuedGames = pendingHandoffEntries
    .filter((entry) => !activeQueueIds.has(entry.queuedGame.queueId))
    .map((entry) => entry.queuedGame);
  const queuedAndHeldGames = [...queuedDerivedGames, ...heldQueuedGames];
  const activeQueuedNewIds = new Set(
    queuedAndHeldGames
      .filter((queuedGame) => queuedGame.gameId === null)
      .map((queuedGame) => queuedGame.queueId)
  );

  handoffByQueueId.forEach((_, queueId) => {
    if (!activeQueuedNewIds.has(queueId)) {
      handoffByQueueId.delete(queueId);
    }
  });

  const reconciledGames = reconcileGamesForDisplay({
    serverGames,
    queuedGames: queuedAndHeldGames,
    handoffByQueueId,
    stableCreatedAtByGameId,
  });

  return reconciledGames.map(
    (game) =>
      ({
        key: game.key,
        date: game.date,
        routeGameId: game.routeGameId,
        routeDraftNonce: game.routeDraftNonce,
        deleteGameId: game.deleteGameId,
        deleteQueueId: game.deleteQueueId,
        createdAt: game.createdAt,
        totalScore: game.totalScore,
        strikes: game.strikes,
        spares: game.spares,
        opens: game.opens,
        framePreviewItems: game.framePreviewItems,
      }) satisfies DisplayGameItem
  );
}
