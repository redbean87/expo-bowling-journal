import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  __setActiveRenderer,
  asyncStorageGetKeys,
  convexOps,
  journalCreateQueue,
  journalCreateQueuePersistCalls,
  localReadCalls,
  mutationCalls,
  resetJournalHookStubs,
  setLocalReadSeed,
} from './stubs/journal-hooks-stubs';
import { __connectivityTestControls } from '../../src/services/connectivity';
import {
  createFakeNetInfo,
  type FakeNetInfo,
  type FakeNetInfoState,
} from '../harness/fake-env';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

import type {
  GameId,
  GameListItem,
  League,
  LeagueId,
  Session,
  SessionId,
} from '../../src/services/journal/types/core';

// Journal hook offline branch tests.
//
// The three journal hooks (`use-games`, `use-leagues`, `use-sessions`) run
// under the plain Node/tsx runner with every un-Node-able import remapped
// to local test doubles ('react' mini hook dispatcher, 'convex/react',
// 'react-native', AsyncStorage, `@/services/journal`, the local-read
// adapters, the journal-create-queue storage, and `use-league-queue`).
//
// Real modules run unmodified: the Phase 1 connectivity singleton
// (`@/services/connectivity`) — driven through
// `__connectivityTestControls` with a simulated netinfo source — the
// journal-create-queue entry factories and upsert engine, the reference
// resolver (`reference-id-resolution`), the client-sync-map storage,
// `reference-draft-id`, and `client-sync-id`.
//
// Covered per callback: offline → no Convex mutation, no throw, no UI
// state touched, and either a correct queued entry (league/session
// create/remove) or an explicit no-op (game create/remove, which have no
// safe queue representation); online → behavior-identical mutation input
// and propagated return value; plus online→offline and offline→online
// transitions without remounting.
//
// The server is sabotaged in this suite: the `convex/react` double records
// and throws on any bound query, and the `local-reads` double serves
// seeded local documents while recording every read. The final test mounts
// all three hooks in a signed-in but unreachable state and asserts they
// render their seeded local data with zero Convex operations.

const stubDir = path.join(__dirname, 'stubs');
const stubPath = path.join(stubDir, 'journal-hooks-stubs.ts');
const stubRewrites: Record<string, string> = {
  react: stubPath,
  'convex/react': stubPath,
  'react-native': stubPath,
  '@react-native-async-storage/async-storage': stubPath,
  '@/services/journal': stubPath,
  '@/services/journal/local-reads': stubPath,
  '@/screens/journal/journal-create-queue-storage': stubPath,
  './use-league-queue': stubPath,
};

const hookHandle = registerStubRemaps(() => stubRewrites);

after(() => {
  hookHandle.deregister();
});

type GamesModule = typeof import('../../src/hooks/journal/use-games');
type LeaguesModule = typeof import('../../src/hooks/journal/use-leagues');
type SessionsModule = typeof import('../../src/hooks/journal/use-sessions');

type HooksModules = {
  games: GamesModule;
  leagues: LeaguesModule;
  sessions: SessionsModule;
};

let hooksModulesPromise: Promise<HooksModules> | null = null;

// Dynamic imports are required so the stub remaps (registered above) are in
// effect when the hooks resolve their imports.
function getHooksModules(): Promise<HooksModules> {
  hooksModulesPromise ??= Promise.all([
    import('../../src/hooks/journal/use-games'),
    import('../../src/hooks/journal/use-leagues'),
    import('../../src/hooks/journal/use-sessions'),
  ]).then(([games, leagues, sessions]) => ({ games, leagues, sessions }));

  return hooksModulesPromise;
}

// --- Test harness ----------------------------------------------------------

type MountedHooks = {
  fake: FakeNetInfo;
  unmount(): void;
  games: ReturnType<GamesModule['useGames']>;
  leagues: ReturnType<LeaguesModule['useLeagues']>;
  sessions: ReturnType<SessionsModule['useSessions']>;
};

type LocalReadSeed = {
  leagues: League[];
  sessions: Session[];
  games: GameListItem[];
};

async function mountHooks(
  initial: FakeNetInfoState,
  seed?: LocalReadSeed
): Promise<MountedHooks> {
  __connectivityTestControls.reset();
  resetJournalHookStubs();

  if (seed) {
    setLocalReadSeed(seed);
  }

  const fake = createFakeNetInfo(initial, true);
  __connectivityTestControls.useNetInfoModule(fake.mod);

  const {
    games: gamesModule,
    leagues: leaguesModule,
    sessions: sessionsModule,
  } = await getHooksModules();

  let gamesApi: ReturnType<GamesModule['useGames']> | null = null;
  let leaguesApi: ReturnType<LeaguesModule['useLeagues']> | null = null;
  let sessionsApi: ReturnType<SessionsModule['useSessions']> | null = null;

  const renderer = new MiniReact(() => {
    gamesApi = gamesModule.useGames('session-1' as never);
    leaguesApi = leaguesModule.useLeagues();
    sessionsApi = sessionsModule.useSessions('league-1' as never);

    return null;
  }, __setActiveRenderer);
  renderer.mount();

  // Let the mount-time cache-load effects settle (AsyncStorage stub).
  await settle();

  if (gamesApi === null || leaguesApi === null || sessionsApi === null) {
    throw new Error('Journal hooks did not mount');
  }

  return {
    fake,
    unmount(): void {
      renderer.unmount();
      __connectivityTestControls.reset();
    },
    games: gamesApi,
    leagues: leaguesApi,
    sessions: sessionsApi,
  };
}

// Drain microtasks and the promise chains they drive (the connectivity
// singleton delivers state as microtasks in general; the storage doubles
// resolve as promises).
async function settle(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

const CLIENT_SYNC_MAP_KEY = 'journal:client-sync-map:v1';

type QueuedEntryView = {
  entityType: string;
  queueId: string;
  clientSyncId?: string;
  leagueId?: string | null;
  leagueClientSyncId?: string | null;
  sessionId?: string | null;
  sessionClientSyncId?: string | null;
  payload: Record<string, unknown>;
};

function entryAt(index: number): QueuedEntryView {
  const entry = journalCreateQueue[index];

  if (!entry) {
    throw new Error(`no queued entry at index ${index}`);
  }

  return entry as QueuedEntryView;
}

// --- Tests -----------------------------------------------------------------

test('offline: createGame is disabled (null, no mutation, no queue, no UI state)', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const result = await harness.games.createGame({
      sessionId: 'session-1' as never,
      date: '2025-01-05',
      clientSyncId: 'cs-game-1',
    });

    assert.equal(result, null);
    assert.equal(harness.games.isCreating, false);
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
  } finally {
    harness.unmount();
  }
});

test('offline: removeGame is disabled (null, no mutation, no queue)', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const result = await harness.games.removeGame({
      gameId: 'game-1' as never,
    });

    assert.equal(result, null);
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
  } finally {
    harness.unmount();
  }
});

test('offline: createLeague queues a league-create entry and returns the draft id', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const result = await harness.leagues.createLeague({
      name: 'Fall League',
      houseId: 'house-1' as never,
      leagueType: 'league',
      clientSyncId: 'cs-league-1',
    });

    assert.equal(result, 'draft-cs-league-1');
    assert.equal(harness.leagues.isCreating, false);
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 1);
    assert.equal(journalCreateQueue.length, 1);

    const entry = entryAt(0);
    assert.equal(entry.entityType, 'league-create');
    assert.equal(entry.clientSyncId, 'cs-league-1');
    assert.equal(entry.queueId, 'league-create::cs-league-1');
    assert.deepStrictEqual(entry.payload, {
      name: 'Fall League',
      gamesPerSession: undefined,
      houseId: 'house-1',
      leagueType: 'league',
    });

    // The offline branch must not reach the reference resolver (which loads
    // the client-sync-map).
    assert.ok(
      !asyncStorageGetKeys.includes(CLIENT_SYNC_MAP_KEY),
      'offline createLeague must not load the client-sync-map'
    );

    // A second create with the same clientSyncId upserts, not duplicates.
    const second = await harness.leagues.createLeague({
      name: 'Fall League',
      leagueType: 'league',
      clientSyncId: 'cs-league-1',
    });
    assert.equal(second, 'draft-cs-league-1');
    assert.equal(journalCreateQueue.length, 1);
    assert.equal(journalCreateQueuePersistCalls.length, 2);
  } finally {
    harness.unmount();
  }
});

test('offline: removeLeague queues a league-delete entry and returns null', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const result = await harness.leagues.removeLeague({
      leagueId: 'league-1' as never,
    });

    assert.equal(result, null);
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 1);

    const entry = entryAt(0);
    assert.equal(entry.entityType, 'league-delete');
    assert.equal(entry.leagueId, 'league-1');
    assert.equal(entry.leagueClientSyncId, null);
    assert.equal(entry.queueId, 'league-delete::id:league-1');
  } finally {
    harness.unmount();
  }
});

test('offline: createSession queues a session-create entry and returns the draft id', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const result = await harness.sessions.createSession({
      leagueId: 'league-1' as never,
      date: '2025-01-05',
      houseId: 'house-1' as never,
      clientSyncId: 'cs-session-1',
    });

    assert.equal(result, 'draft-cs-session-1');
    assert.equal(harness.sessions.isCreating, false);
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 1);

    const entry = entryAt(0);
    assert.equal(entry.entityType, 'session-create');
    assert.equal(entry.clientSyncId, 'cs-session-1');
    assert.equal(entry.queueId, 'session-create::cs-session-1');
    assert.equal(entry.payload.leagueId, 'league-1');
    assert.equal(entry.payload.leagueClientSyncId, null);
    assert.equal(entry.payload.date, '2025-01-05');
    assert.equal(entry.payload.houseId, 'house-1');

    // The offline branch must not reach the reference resolver (which loads
    // the client-sync-map).
    assert.ok(
      !asyncStorageGetKeys.includes(CLIENT_SYNC_MAP_KEY),
      'offline createSession must not load the client-sync-map'
    );

    // Without a caller-provided clientSyncId a fresh one is generated and
    // the matching draft id is returned.
    const generated = await harness.sessions.createSession({
      leagueId: 'league-1' as never,
      date: '2025-01-06',
    });
    assert.ok(generated.startsWith('draft-session-'));
    assert.equal(journalCreateQueue.length, 2);
    assert.equal(entryAt(1).clientSyncId, generated.slice('draft-'.length));
  } finally {
    harness.unmount();
  }
});

test('offline: removeSession queues a session-delete entry and returns null', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const result = await harness.sessions.removeSession({
      sessionId: 'session-9' as never,
    });

    assert.equal(result, null);
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 1);

    const entry = entryAt(0);
    assert.equal(entry.entityType, 'session-delete');
    assert.equal(entry.sessionId, 'session-9');
    assert.equal(entry.sessionClientSyncId, null);
    assert.equal(entry.queueId, 'session-delete::id:session-9');
  } finally {
    harness.unmount();
  }
});

test('online: all six callbacks stay behavior-identical (exact inputs, propagated returns)', async () => {
  const harness = await mountHooks({ isConnected: true, type: 'wifi' });

  try {
    const createdGame = await harness.games.createGame({
      sessionId: 'session-1' as never,
      date: '2025-01-05',
      clientSyncId: 'cs-game-1',
    });
    assert.equal(createdGame, 'server-createGame');

    const removedGame = await harness.games.removeGame({
      gameId: 'game-1' as never,
    });
    assert.equal(removedGame, 'server-removeGame');

    const createdLeague = await harness.leagues.createLeague({
      name: 'Fall League',
      houseId: 'house-1' as never,
      leagueType: 'league',
    });
    assert.equal(createdLeague, 'server-createLeague');

    const removedLeague = await harness.leagues.removeLeague({
      leagueId: 'league-1' as never,
    });
    assert.equal(removedLeague, 'server-removeLeague');

    const createdSession = await harness.sessions.createSession({
      leagueId: 'league-1' as never,
      date: '2025-01-05',
      houseId: 'house-1' as never,
      ballId: 'ball-1' as never,
      patternId: 'pattern-1' as never,
    });
    assert.equal(createdSession, 'server-createSession');

    const removedSession = await harness.sessions.removeSession({
      sessionId: 'session-9' as never,
    });
    assert.equal(removedSession, 'server-removeSession');

    assert.deepEqual(
      mutationCalls.map((call) => call.name),
      [
        'createGame',
        'removeGame',
        'createLeague',
        'removeLeague',
        'createSession',
        'removeSession',
      ]
    );
    assert.deepStrictEqual(mutationCalls[0].input, {
      sessionId: 'session-1',
      date: '2025-01-05',
      clientSyncId: 'cs-game-1',
    });
    assert.deepStrictEqual(mutationCalls[1].input, { gameId: 'game-1' });
    assert.deepStrictEqual(mutationCalls[2].input, {
      name: 'Fall League',
      houseId: 'house-1',
      type: 'league',
    });
    assert.deepStrictEqual(mutationCalls[3].input, { leagueId: 'league-1' });
    assert.deepStrictEqual(mutationCalls[4].input, {
      leagueId: 'league-1',
      date: '2025-01-05',
      houseId: 'house-1',
      patternId: 'pattern-1',
      ballId: 'ball-1',
    });
    assert.deepStrictEqual(mutationCalls[5].input, { sessionId: 'session-9' });

    // Ordinary online mutations never touch the journal-create queue.
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);

    // The online path still resolves references through the real sync-map
    // load (house id passed to createLeague/createSession).
    assert.ok(
      asyncStorageGetKeys.includes(CLIENT_SYNC_MAP_KEY),
      'online createLeague/createSession must load the client-sync-map'
    );
  } finally {
    harness.unmount();
  }
});

test('online to offline: later calls queue without touching Convex', async () => {
  const harness = await mountHooks({ isConnected: true, type: 'wifi' });

  try {
    const created = await harness.leagues.createLeague({
      name: 'Online League',
    });
    assert.equal(created, 'server-createLeague');
    assert.equal(mutationCalls.length, 1);

    harness.fake.emit({ isConnected: false, type: 'none' });

    const draftId = await harness.leagues.createLeague({
      name: 'Offline League',
      clientSyncId: 'cs-off-line',
    });
    assert.equal(draftId, 'draft-cs-off-line');
    assert.equal(mutationCalls.length, 1);
    assert.equal(journalCreateQueue.length, 1);
    assert.equal(entryAt(0).entityType, 'league-create');

    const removed = await harness.sessions.removeSession({
      sessionId: 'session-77' as never,
    });
    assert.equal(removed, null);
    assert.equal(mutationCalls.length, 1);
    assert.equal(journalCreateQueue.length, 2);
    assert.equal(entryAt(1).entityType, 'session-delete');
  } finally {
    harness.unmount();
  }
});

test('offline to online: recovery restores mutation calls with the same behavior', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const draftId = await harness.sessions.createSession({
      leagueId: 'league-1' as never,
      date: '2025-01-05',
    });
    assert.ok(draftId.startsWith('draft-session-'));
    assert.equal(journalCreateQueue.length, 1);

    harness.fake.emit({ isConnected: true, type: 'wifi' });

    const sessionId = await harness.sessions.createSession({
      leagueId: 'league-1' as never,
      date: '2025-01-06',
    });
    assert.equal(sessionId, 'server-createSession');
    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0].name, 'createSession');
    assert.deepStrictEqual(mutationCalls[0].input, {
      leagueId: 'league-1',
      date: '2025-01-06',
      houseId: null,
      patternId: null,
      ballId: null,
    });

    // The queued offline entry is still waiting for the flusher.
    assert.equal(journalCreateQueue.length, 1);
    assert.equal(entryAt(0).entityType, 'session-create');
  } finally {
    harness.unmount();
  }
});

// Seeded local journal documents for the sabotaged-server proof test. The
// shapes mirror what the real SQLite-backed adapter reports: one league
// ('league-1') with two sessions, the first with two games, plus one
// off-league session and one off-session game that must be filtered out.
const LEAGUE_ID = 'league-1' as LeagueId;
const SESSION_ID = 'session-1' as SessionId;

const localLeague: League = {
  _id: LEAGUE_ID,
  _creationTime: 1736054400000,
  userId: 'local-user' as League['userId'],
  name: 'Alpha League',
  createdAt: 1736054400000,
  gamesPerSession: 5,
};

const localSessionOne: Session = {
  _id: SESSION_ID,
  _creationTime: 1736079600000,
  userId: 'local-user' as Session['userId'],
  leagueId: LEAGUE_ID,
  date: '2025-01-05',
  weekNumber: 2,
};

const localSessionTwo: Session = {
  _id: 'session-2' as SessionId,
  _creationTime: 1736166000000,
  userId: 'local-user' as Session['userId'],
  leagueId: LEAGUE_ID,
  date: '2025-01-06',
  weekNumber: 2,
};

const offLeagueSession: Session = {
  _id: 'session-9' as SessionId,
  _creationTime: 1738414800000,
  userId: 'local-user' as Session['userId'],
  leagueId: 'other-league' as LeagueId,
  date: '2025-02-01',
};

const localGameOne: GameListItem = {
  _id: 'game-1' as GameId,
  _creationTime: 1736079600000,
  userId: 'local-user' as GameListItem['userId'],
  sessionId: SESSION_ID,
  leagueId: LEAGUE_ID,
  date: '2025-01-05',
  totalScore: 300,
  strikes: 12,
  spares: 0,
  opens: 0,
};

const localGameTwo: GameListItem = {
  _id: 'game-2' as GameId,
  _creationTime: 1736079601000,
  userId: 'local-user' as GameListItem['userId'],
  sessionId: SESSION_ID,
  leagueId: LEAGUE_ID,
  date: '2025-01-05',
  totalScore: 120,
  strikes: 2,
  spares: 2,
  opens: 6,
};

const offSessionGame: GameListItem = {
  _id: 'game-9' as GameId,
  _creationTime: 1736166000000,
  userId: 'local-user' as GameListItem['userId'],
  sessionId: 'session-2' as SessionId,
  leagueId: LEAGUE_ID,
  date: '2025-01-06',
  totalScore: 90,
  strikes: 0,
  spares: 3,
  opens: 7,
};

test('sabotaged server: the three hooks render from local data', async () => {
  const harness = await mountHooks(
    { isConnected: false, type: 'none' },
    {
      leagues: [localLeague],
      sessions: [localSessionOne, localSessionTwo, offLeagueSession],
      games: [localGameOne, localGameTwo, offSessionGame],
    }
  );

  try {
    // Zero server attempts: the sabotaged double records and throws on any
    // bound query, so the completed render above proves no Convex read was
    // bound.
    assert.deepEqual(convexOps, []);

    // Every read went through the local adapter, in the component's hook
    // order (use-games, use-leagues, use-sessions).
    assert.deepEqual(localReadCalls, [
      'listLocalGamesBySession',
      'listLocalLeagues',
      'listLocalSessionsByLeague',
    ]);

    // The rendered data is the seeded local data: the off-league session and
    // the off-session game are filtered out, as the real adapter does.
    assert.equal(harness.leagues.isLoading, false);
    assert.deepEqual(harness.leagues.leagues, [localLeague]);

    assert.equal(harness.sessions.isLoading, false);
    assert.deepEqual(harness.sessions.sessions, [
      localSessionOne,
      localSessionTwo,
    ]);

    assert.equal(harness.games.isLoading, false);
    assert.deepEqual(harness.games.games, [localGameOne, localGameTwo]);
  } finally {
    harness.unmount();
  }
});
