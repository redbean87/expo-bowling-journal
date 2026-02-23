import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reconcileGamesForDisplay,
  type QueueGameForReconciliation,
  type ServerGameForReconciliation,
} from '../../src/screens/journal-games-reconciliation';

const BASE_TIME = 1_700_000_000_000;

function buildServerGame(
  overrides?: Partial<ServerGameForReconciliation>
): ServerGameForReconciliation {
  return {
    id: 'game-1',
    clientSyncId: null,
    date: '2026-02-19',
    createdAt: BASE_TIME,
    totalScore: 200,
    strikes: 6,
    spares: 2,
    opens: 2,
    framePreviewItems: [{ text: 'X', hasSplit: false }],
    ...overrides,
  };
}

function buildQueuedGame(
  overrides?: Partial<QueueGameForReconciliation>
): QueueGameForReconciliation {
  return {
    queueId: 'session-1::new::draft-a',
    date: '2026-02-19',
    gameId: null,
    draftNonce: 'draft-a',
    createdAt: BASE_TIME,
    totalScore: 200,
    strikes: 6,
    spares: 2,
    opens: 2,
    framePreviewItems: [{ text: 'X', hasSplit: false }],
    ...overrides,
  };
}

test('reconcileGamesForDisplay overlays queued edits for existing game ids', () => {
  const handoff = new Map<string, string>();
  const display = reconcileGamesForDisplay({
    serverGames: [buildServerGame({ id: 'game-42' })],
    queuedGames: [
      buildQueuedGame({
        queueId: 'session-1::game-42',
        gameId: 'game-42',
        draftNonce: null,
        totalScore: 221,
      }),
    ],
    handoffByQueueId: handoff,
    stableCreatedAtByGameId: new Map<string, number>(),
  });

  assert.equal(display.length, 1);
  assert.equal(display[0]?.routeGameId, 'game-42');
  assert.equal(display[0]?.totalScore, 221);
  assert.equal(display[0]?.deleteQueueId, 'session-1::game-42');
  assert.equal(display[0]?.deleteGameId, 'game-42');
});

test('reconcileGamesForDisplay keeps stable key during queued-to-synced handoff', () => {
  const handoff = new Map<string, string>();
  const queued = buildQueuedGame({ queueId: 'session-1::new::draft-b' });
  const server = buildServerGame({ id: 'game-created-1' });

  const firstPass = reconcileGamesForDisplay({
    serverGames: [server],
    queuedGames: [queued],
    handoffByQueueId: handoff,
    stableCreatedAtByGameId: new Map<string, number>(),
  });

  assert.equal(firstPass.length, 1);
  assert.equal(firstPass[0]?.key, 'game-created-1');
  assert.equal(firstPass[0]?.routeGameId, 'game-created-1');
  assert.equal(handoff.get('session-1::new::draft-b'), 'game-created-1');

  const secondPass = reconcileGamesForDisplay({
    serverGames: [server],
    queuedGames: [queued],
    handoffByQueueId: handoff,
    stableCreatedAtByGameId: new Map<string, number>(),
  });

  assert.equal(secondPass.length, 1);
  assert.equal(secondPass[0]?.key, 'game-created-1');
});

test('reconcileGamesForDisplay prefers exact client sync id matching', () => {
  const handoff = new Map<string, string>();
  const stableCreatedAt = new Map<string, number>();
  const queued = buildQueuedGame({ draftNonce: 'draft-match' });
  const unrelatedServer = buildServerGame({
    id: 'game-unrelated',
    createdAt: BASE_TIME - 5_000,
    clientSyncId: null,
  });
  const matchedServer = buildServerGame({
    id: 'game-matched',
    createdAt: BASE_TIME + 50_000,
    clientSyncId: 'draft-match',
  });

  const display = reconcileGamesForDisplay({
    serverGames: [unrelatedServer, matchedServer],
    queuedGames: [queued],
    handoffByQueueId: handoff,
    stableCreatedAtByGameId: stableCreatedAt,
  });

  assert.equal(
    display.some((game) => game.routeGameId === 'game-matched'),
    true
  );
  assert.equal(
    display.some((game) => game.routeGameId === 'new'),
    false
  );
});

test('reconcileGamesForDisplay falls back to queued row when mapped server id is absent', () => {
  const handoff = new Map<string, string>([
    ['session-1::new::draft-a', 'missing-game-id'],
  ]);

  const display = reconcileGamesForDisplay({
    serverGames: [],
    queuedGames: [buildQueuedGame()],
    handoffByQueueId: handoff,
    stableCreatedAtByGameId: new Map<string, number>(),
  });

  assert.equal(display.length, 1);
  assert.equal(display[0]?.key, 'session-1::new::draft-a');
  assert.equal(display[0]?.routeGameId, 'new');
});

test('reconcileGamesForDisplay sorts by createdAt then key for deterministic order', () => {
  const handoff = new Map<string, string>();

  const display = reconcileGamesForDisplay({
    serverGames: [
      buildServerGame({ id: 'game-b', createdAt: BASE_TIME }),
      buildServerGame({ id: 'game-a', createdAt: BASE_TIME }),
    ],
    queuedGames: [],
    handoffByQueueId: handoff,
    stableCreatedAtByGameId: new Map<string, number>(),
  });

  assert.deepEqual(
    display.map((item) => item.key),
    ['game-a', 'game-b']
  );
});

test('reconcileGamesForDisplay reuses stable createdAt after queue handoff settles', () => {
  const handoff = new Map<string, string>();
  const stableCreatedAt = new Map<string, number>([
    ['game-1', BASE_TIME - 5_000],
  ]);

  const display = reconcileGamesForDisplay({
    serverGames: [
      buildServerGame({ id: 'game-1', createdAt: BASE_TIME + 5_000 }),
    ],
    queuedGames: [],
    handoffByQueueId: handoff,
    stableCreatedAtByGameId: stableCreatedAt,
  });

  assert.equal(display[0]?.createdAt, BASE_TIME - 5_000);
});
