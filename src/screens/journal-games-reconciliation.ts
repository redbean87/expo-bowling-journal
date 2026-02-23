type PreviewItem = {
  text: string;
  hasSplit: boolean;
};

export type ServerGameForReconciliation = {
  id: string;
  clientSyncId: string | null;
  date: string;
  createdAt: number;
  totalScore: number;
  strikes: number;
  spares: number;
  opens: number;
  framePreviewItems: PreviewItem[];
};

export type QueueGameForReconciliation = {
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

export type ReconciledDisplayGame = {
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

function buildGameFingerprint(game: {
  date: string;
  totalScore: number;
  strikes: number;
  spares: number;
  opens: number;
  framePreviewItems: PreviewItem[];
}) {
  const preview = game.framePreviewItems
    .map((item) => `${item.text}|${item.hasSplit ? '1' : '0'}`)
    .join('||');

  return `${game.date}|${String(game.totalScore)}|${String(game.strikes)}|${String(game.spares)}|${String(game.opens)}|${preview}`;
}

function sortByCreatedAtThenKey(
  left: ReconciledDisplayGame,
  right: ReconciledDisplayGame
) {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }

  return left.key.localeCompare(right.key);
}

function findEquivalentServerGameId(
  queuedGame: QueueGameForReconciliation,
  serverGames: ReconciledDisplayGame[]
) {
  const queuedFingerprint = buildGameFingerprint(queuedGame);
  const matchWindowMs = 5 * 60 * 1000;

  const sameFingerprint = serverGames.filter((serverGame) => {
    if (serverGame.date !== queuedGame.date) {
      return false;
    }

    return buildGameFingerprint(serverGame) === queuedFingerprint;
  });

  if (sameFingerprint.length === 0) {
    return null;
  }

  const closestInWindow = sameFingerprint
    .filter(
      (serverGame) =>
        Math.abs(serverGame.createdAt - queuedGame.createdAt) <= matchWindowMs
    )
    .sort(
      (left, right) =>
        Math.abs(left.createdAt - queuedGame.createdAt) -
        Math.abs(right.createdAt - queuedGame.createdAt)
    )[0];

  if (closestInWindow) {
    return closestInWindow.routeGameId;
  }

  return null;
}

function findServerGameIdByClientSyncId(
  queuedGame: QueueGameForReconciliation,
  serverGames: ServerGameForReconciliation[]
) {
  if (!queuedGame.draftNonce) {
    return null;
  }

  const matchedServerGame = serverGames.find(
    (serverGame) => serverGame.clientSyncId === queuedGame.draftNonce
  );

  return matchedServerGame?.id ?? null;
}

export function reconcileGamesForDisplay({
  serverGames,
  queuedGames,
  handoffByQueueId,
  stableCreatedAtByGameId,
}: {
  serverGames: ServerGameForReconciliation[];
  queuedGames: QueueGameForReconciliation[];
  handoffByQueueId: Map<string, string>;
  stableCreatedAtByGameId: Map<string, number>;
}): ReconciledDisplayGame[] {
  const queuedByGameId = new Map<string, QueueGameForReconciliation>();
  const queuedNewGames: QueueGameForReconciliation[] = [];

  for (const queuedGame of queuedGames) {
    if (queuedGame.gameId) {
      queuedByGameId.set(queuedGame.gameId, queuedGame);
      continue;
    }

    queuedNewGames.push(queuedGame);
  }

  const mergedServerGames = serverGames.map((serverGame) => {
    const stableCreatedAt = stableCreatedAtByGameId.get(serverGame.id);
    const queuedOverlay = queuedByGameId.get(serverGame.id);

    if (!queuedOverlay) {
      return {
        key: serverGame.id,
        date: serverGame.date,
        routeGameId: serverGame.id,
        routeDraftNonce: null,
        deleteGameId: serverGame.id,
        deleteQueueId: null,
        createdAt: stableCreatedAt ?? serverGame.createdAt,
        totalScore: serverGame.totalScore,
        strikes: serverGame.strikes,
        spares: serverGame.spares,
        opens: serverGame.opens,
        framePreviewItems: serverGame.framePreviewItems,
      } satisfies ReconciledDisplayGame;
    }

    return {
      key: serverGame.id,
      date: serverGame.date,
      routeGameId: serverGame.id,
      routeDraftNonce: null,
      deleteGameId: serverGame.id,
      deleteQueueId: queuedOverlay.queueId,
      createdAt: stableCreatedAt ?? serverGame.createdAt,
      totalScore: queuedOverlay.totalScore,
      strikes: queuedOverlay.strikes,
      spares: queuedOverlay.spares,
      opens: queuedOverlay.opens,
      framePreviewItems: queuedOverlay.framePreviewItems,
    } satisfies ReconciledDisplayGame;
  });

  const serverById = new Map(
    mergedServerGames.map((serverGame) => [serverGame.routeGameId, serverGame])
  );
  const suppressedServerGameIds = new Set<string>();

  const queuedNewItems = queuedNewGames.map((queuedGame) => {
    const mappedServerGameId = handoffByQueueId.get(queuedGame.queueId);
    const mappedServerExists = mappedServerGameId
      ? serverById.get(mappedServerGameId)
      : null;
    const matchedByClientSyncId = findServerGameIdByClientSyncId(
      queuedGame,
      serverGames
    );
    const equivalentServerGameId =
      matchedByClientSyncId ??
      mappedServerExists?.routeGameId ??
      findEquivalentServerGameId(queuedGame, mergedServerGames);

    if (equivalentServerGameId) {
      handoffByQueueId.set(queuedGame.queueId, equivalentServerGameId);
      stableCreatedAtByGameId.set(equivalentServerGameId, queuedGame.createdAt);
      suppressedServerGameIds.add(equivalentServerGameId);

      return {
        key: equivalentServerGameId,
        date: queuedGame.date,
        routeGameId: equivalentServerGameId,
        routeDraftNonce: null,
        deleteGameId: equivalentServerGameId,
        deleteQueueId: queuedGame.queueId,
        createdAt: queuedGame.createdAt,
        totalScore: queuedGame.totalScore,
        strikes: queuedGame.strikes,
        spares: queuedGame.spares,
        opens: queuedGame.opens,
        framePreviewItems: queuedGame.framePreviewItems,
      } satisfies ReconciledDisplayGame;
    }

    return {
      key: queuedGame.queueId,
      date: queuedGame.date,
      routeGameId: 'new',
      routeDraftNonce: queuedGame.draftNonce,
      deleteGameId: null,
      deleteQueueId: queuedGame.queueId,
      createdAt: queuedGame.createdAt,
      totalScore: queuedGame.totalScore,
      strikes: queuedGame.strikes,
      spares: queuedGame.spares,
      opens: queuedGame.opens,
      framePreviewItems: queuedGame.framePreviewItems,
    } satisfies ReconciledDisplayGame;
  });

  const filteredServerGames = mergedServerGames.filter(
    (game) => !suppressedServerGameIds.has(game.routeGameId)
  );

  return [...filteredServerGames, ...queuedNewItems].sort(
    sortByCreatedAtThenKey
  );
}
