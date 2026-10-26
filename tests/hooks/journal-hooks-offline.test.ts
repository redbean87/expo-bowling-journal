import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  __setActiveRenderer,
  asyncStorageGetKeys,
  convexOps,
  journalCreateQueue,
  journalCreateQueuePersistCalls,
  LOCAL_JOURNAL_USER_ID,
  localReadCalls,
  mutationCalls,
  resetJournalHookStubs,
  setLocalReadSeed,
} from './stubs/journal-hooks-stubs';
import {
  FULL_PIN_MASK,
  packManualPins,
} from '../../src/screens/game-editor/frame-mask-utils';
import { __connectivityTestControls } from '../../src/services/connectivity';
import {
  createFakeNetInfo,
  type FakeNetInfo,
  type FakeNetInfoState,
} from '../harness/fake-env';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

import type {
  Frame,
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
// `reference-draft-id`, and `client-sync-id`. `@/services/journal/local-writes`
// is deliberately NOT remapped: the converted league, session, and game hooks
// (C-2) write through the real SQLite-backed local journal service, so the
// league, session, and game write tests read the persisted entity back from
// that same service.
//
// Covered per callback: the legacy offline branch (no Convex mutation, no
// throw, no UI state touched, and an explicit no-op) and the online branch
// (behavior-identical mutation input and propagated return value) survive only
// for callbacks that have not been converted; plus online→offline and
// offline→online transitions without remounting. League, session, and game
// callbacks are converted (C-2): in every connectivity state they write
// straight to the SQLite-backed local journal, return the persisted local
// UUID, and never enqueue a journal-create entry.
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
  'expo-sqlite': path.join(__dirname, '..', 'db', 'expo-sqlite-stub.mjs'),
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

// The journal-create queue is no longer inspected entry-by-entry: the
// converted league and session hooks never enqueue, so the tests assert only
// that the queue stayed empty (`journalCreateQueue.length`) and was never
// persisted (`journalCreateQueuePersistCalls.length`).

// --- Tests -----------------------------------------------------------------

// The local UUID the SQLite-backed service mints for every canonical entity.
const LOCAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// --- C-2: game writes go straight to local SQLite -------------------------
//
// The game hook no longer binds a Convex mutation and no longer returns the
// legacy silent null while "offline": `createGame`/`removeGame` call the
// app-boundary write adapter (`src/services/journal/local-writes.ts`), which
// writes through the real SQLite-backed local journal service. These tests
// drive the real hook and read the game back from that same service, so a
// queue-based or server-based game write fails the suite. The service's
// foreign-key integrity (NO ACTION) and its delete-by-id behavior are the
// service's own and stay unchanged; the hook only propagates them.

test('local mode: createGame persists the game locally and returns the local id', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const league = await journal.createLeague({ name: 'Fall League' });
    const session = await journal.createSession({
      leagueId: league.id,
      date: '2025-01-05',
    });

    const result = await harness.games.createGame({
      sessionId: session.id as SessionId,
      date: '2025-01-05',
      clientSyncId: 'cs-game-1',
    });

    // No server mutation, no queue entry, no queue persist, and no
    // reference-resolver (client-sync-map) load: the write is local, and it
    // stays local while the device reports no network at all.
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
    assert.ok(
      !asyncStorageGetKeys.includes(CLIENT_SYNC_MAP_KEY),
      'local createGame must not load the client-sync-map'
    );
    assert.equal(harness.games.isCreating, false);

    // The returned id is the persisted local UUID, never a draft id.
    assert.ok(
      !String(result).startsWith('draft-'),
      'local createGame must not return a draft id'
    );
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(result)),
      'local createGame must return a local UUID'
    );

    // Read-back through the real SQLite-backed service proves the write
    // landed there, with the transport artifact (`clientSyncId`) dropped and
    // the game → session foreign key kept as the local session's id.
    const persisted = await journal.getGame(result);
    assert.ok(persisted !== null, 'the created game must persist locally');
    assert.equal(persisted.id, result);
    assert.equal(persisted.sessionId, session.id);
    assert.equal(persisted.date, '2025-01-05');
    assert.equal(persisted.ballId, null);
    assert.equal(persisted.patternId, null);

    // A second create with the same clientSyncId is a second local game:
    // local ids are per-entity, so nothing upserts onto the first.
    const second = await harness.games.createGame({
      sessionId: session.id as SessionId,
      date: '2025-01-06',
      clientSyncId: 'cs-game-1',
    });
    assert.notEqual(second, result);
    assert.ok(LOCAL_UUID_PATTERN.test(String(second)));
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
    assert.deepEqual(
      (await journal.listGames({ sessionId: session.id })).map(
        (game) => game.date
      ),
      ['2025-01-05', '2025-01-06']
    );
  } finally {
    harness.unmount();
  }
});

test('local mode: removeGame deletes the game and its frames and returns its local id', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const league = await journal.createLeague({ name: 'Fall League' });
    const session = await journal.createSession({
      leagueId: league.id,
      date: '2025-01-05',
    });
    const game = await journal.createGame({
      sessionId: session.id,
      date: '2025-01-05',
    });
    await journal.replaceGameFrames(game.id, [
      { frameNumber: 1, roll1Mask: 1023 },
      { frameNumber: 2, roll1Mask: 31 },
    ]);

    const result = await harness.games.removeGame({
      gameId: game.id as GameId,
    });

    // The delete returns the local id it deleted, not the legacy silent null:
    // the screen's delete confirmation can no longer report success over a
    // game that is still there.
    assert.equal(result, game.id);

    // No server mutation, no queue entry, no queue persist.
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);

    // The game and its frames are gone: the frames are cleared first because
    // the canonical foreign keys are enforced with NO ACTION, so a game that
    // still has referencing frames cannot be deleted.
    assert.equal(await journal.getGame(game.id), null);
    assert.deepEqual(await journal.getGameFrames(game.id), []);
    assert.deepEqual(await journal.listGames(), []);

    // The approved scope is the game and its frames only: neither its session
    // nor its league is swept in.
    assert.notEqual(await journal.getSession(session.id), null);
    assert.notEqual(await journal.getLeague(league.id), null);
  } finally {
    harness.unmount();
  }
});

test('local mode: removeGame on an unknown id is a no-op and returns the id', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const league = await journal.createLeague({ name: 'Fall League' });
    const session = await journal.createSession({
      leagueId: league.id,
      date: '2025-01-05',
    });
    const game = await journal.createGame({
      sessionId: session.id,
      date: '2025-01-05',
    });
    await journal.replaceGameFrames(game.id, [
      { frameNumber: 1, roll1Mask: 3 },
    ]);

    const unknownId = '00000000-0000-0000-0000-000000000000' as GameId;
    const result = await harness.games.removeGame({ gameId: unknownId });

    // An unknown id stays a no-op, matching the local service: it returns the
    // id it was asked about, and nothing else in the journal is disturbed.
    assert.equal(result, unknownId);
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
    assert.equal(await journal.getGame(unknownId), null);
    assert.notEqual(await journal.getGame(game.id), null);
    assert.deepEqual(
      (await journal.getGameFrames(game.id)).map((frame) => frame.frameNumber),
      [1]
    );
  } finally {
    harness.unmount();
  }
});

// --- C-2: league writes go straight to local SQLite -----------------------
//
// The league hook no longer binds a Convex mutation and no longer enqueues a
// journal-create entry: `createLeague`/`updateLeague`/`removeLeague` call the
// app-boundary write adapter (`src/services/journal/local-writes.ts`), which
// writes through the real SQLite-backed local journal service. These tests
// drive the real hook and read the entity back from that same service, so a
// queue-based or server-based league write fails the suite. The service's
// foreign-key integrity (NO ACTION) and its delete-by-id behavior are the
// service's own and stay unchanged; the hook only propagates them.

test('local mode: createLeague persists the league locally and returns the local id', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const house = await journal.createHouse({ name: 'Fall House' });

    const result = await harness.leagues.createLeague({
      name: 'Fall League',
      houseId: house.id as never,
      leagueType: 'league',
      clientSyncId: 'cs-league-1',
    });

    // No server mutation, no queue entry, no queue persistence, and no
    // reference-resolver (client-sync-map) load: the write is local.
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
    assert.ok(
      !asyncStorageGetKeys.includes(CLIENT_SYNC_MAP_KEY),
      'local createLeague must not load the client-sync-map'
    );
    assert.equal(harness.leagues.isCreating, false);

    // The returned id is the persisted local UUID, never a draft id.
    assert.ok(
      !String(result).startsWith('draft-'),
      'local createLeague must not return a draft id'
    );
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(result)),
      'local createLeague must return a local UUID'
    );

    // Read-back through the real SQLite-backed service proves the write
    // landed there, with the transport artifacts (`clientSyncId`, `leagueType`)
    // dropped from canonical local data.
    const persisted = await journal.getLeague(result);
    assert.ok(persisted !== null, 'the created league must persist locally');
    assert.equal(persisted.id, result);
    assert.equal(persisted.name, 'Fall League');
    assert.equal(persisted.houseId, house.id);
    assert.equal(persisted.gamesPerSession, null);

    // A second create with the same clientSyncId is a second local league:
    // local ids are per-entity, so nothing upserts onto the first.
    const second = await harness.leagues.createLeague({
      name: 'Fall League',
      leagueType: 'league',
      clientSyncId: 'cs-league-1',
    });
    assert.notEqual(second, result);
    assert.ok(LOCAL_UUID_PATTERN.test(String(second)));
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
    assert.deepEqual(
      (await journal.listLeagues()).map((league) => league.name),
      ['Fall League', 'Fall League']
    );
  } finally {
    harness.unmount();
  }
});

test('local mode: removeLeague deletes only the league and returns its local id', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const created = await harness.leagues.createLeague({ name: 'Fall League' });
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(created)),
      'the create must return a local UUID'
    );
    assert.ok(
      (await journal.getLeague(created)) !== null,
      'the league must exist locally before the delete'
    );

    const result = await harness.leagues.removeLeague({
      leagueId: created,
    });

    assert.equal(result, created);
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);

    assert.equal(await journal.getLeague(created), null);
    assert.deepEqual(await journal.listLeagues(), []);
  } finally {
    harness.unmount();
  }
});

test('local mode: removeLeague keeps foreign-key integrity (a league with sessions rejects)', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const league = await journal.createLeague({ name: 'Parent League' });
    const session = await journal.createSession({
      leagueId: league.id,
      date: '2025-01-05',
    });

    let caught: unknown = null;
    try {
      await harness.leagues.removeLeague({ leagueId: league.id as LeagueId });
    } catch (error) {
      caught = error;
    }

    // The canonical FKs are enforced with NO ACTION, so the delete rejects
    // while the session still references the league: no cascade, no silent
    // data loss, and nothing is re-queued for a later flush.
    assert.ok(
      caught !== null,
      'a league that still has sessions must reject a delete'
    );
    assert.ok(
      (await journal.getLeague(league.id)) !== null,
      'the league must survive the rejected delete'
    );
    assert.ok(
      (await journal.getSession(session.id)) !== null,
      'the session must survive the rejected delete'
    );
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
  } finally {
    harness.unmount();
  }
});

// --- C-2: session writes go straight to local SQLite ----------------------
//
// The session hook no longer binds a Convex mutation and no longer enqueues a
// journal-create entry: `createSession`/`updateSession`/`removeSession` call
// the app-boundary write adapter (`src/services/journal/local-writes.ts`),
// which writes through the real SQLite-backed local journal service. These
// tests drive the real hook and read the session back from that same service,
// so a queue-based or server-based session write fails the suite. The service's
// foreign-key integrity (NO ACTION) and its delete-by-id behavior are the
// service's own and stay unchanged; the hook only propagates them.

test('local mode: createSession persists the session locally and returns the local id', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const league = await journal.createLeague({ name: 'Fall League' });
    const house = await journal.createHouse({ name: 'Fall House' });

    const result = await harness.sessions.createSession({
      leagueId: league.id as LeagueId,
      date: '2025-01-05',
      houseId: house.id as never,
      clientSyncId: 'cs-session-1',
    });

    // No server mutation, no queue entry, no queue persist, and no
    // reference-resolver (client-sync-map) load: the write is local.
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
    assert.ok(
      !asyncStorageGetKeys.includes(CLIENT_SYNC_MAP_KEY),
      'local createSession must not load the client-sync-map'
    );
    assert.equal(harness.sessions.isCreating, false);

    // The returned id is the persisted local UUID, never a draft id.
    assert.ok(
      !String(result).startsWith('draft-'),
      'local createSession must not return a draft id'
    );
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(result)),
      'local createSession must return a local UUID'
    );

    // Read-back through the real SQLite-backed service proves the write
    // landed there, with the transport artifact (`clientSyncId`) dropped and
    // the session → league foreign key kept as the local league's id.
    const persisted = await journal.getSession(result);
    assert.ok(persisted !== null, 'the created session must persist locally');
    assert.equal(persisted.id, result);
    assert.equal(persisted.leagueId, league.id);
    assert.equal(persisted.date, '2025-01-05');
    assert.equal(persisted.weekNumber, null);
    assert.equal(persisted.houseId, house.id);

    // A second create with the same clientSyncId is a second local session:
    // local ids are per-entity, so nothing upserts onto the first.
    const second = await harness.sessions.createSession({
      leagueId: league.id as LeagueId,
      date: '2025-01-06',
      clientSyncId: 'cs-session-1',
    });
    assert.notEqual(second, result);
    assert.ok(LOCAL_UUID_PATTERN.test(String(second)));
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
    assert.deepEqual(
      (await journal.listSessions()).map((session) => session.date),
      ['2025-01-05', '2025-01-06']
    );
  } finally {
    harness.unmount();
  }
});

test('local mode: removeSession deletes only the session and returns its local id', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const league = await journal.createLeague({ name: 'Fall League' });
    const created = await harness.sessions.createSession({
      leagueId: league.id as LeagueId,
      date: '2025-01-05',
    });
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(created)),
      'the create must return a local UUID'
    );
    assert.ok(
      (await journal.getSession(created)) !== null,
      'the session must exist locally before the delete'
    );

    const result = await harness.sessions.removeSession({
      sessionId: created,
    });

    // The delete returns the local id it deleted, not null: the legacy
    // queue-entry return contract is gone.
    assert.equal(result, created);

    // No server mutation, no queue entry, no queue persist.
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);

    // The session row is gone and nothing else was swept in: the approved
    // scope is the session alone, and its league survives.
    assert.equal(await journal.getSession(created), null);
    assert.deepEqual(await journal.listSessions(), []);
    assert.notEqual(await journal.getLeague(league.id), null);
  } finally {
    harness.unmount();
  }
});

test('local mode: removeSession keeps foreign-key integrity (a session with games rejects)', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const league = await journal.createLeague({ name: 'Parent League' });
    const session = await journal.createSession({
      leagueId: league.id,
      date: '2025-01-05',
    });
    await journal.createGame({ sessionId: session.id, date: '2025-01-05' });

    let caught: unknown = null;
    try {
      await harness.sessions.removeSession({
        sessionId: session.id as SessionId,
      });
    } catch (error) {
      caught = error;
    }

    // The canonical FKs are enforced with NO ACTION, so the delete rejects
    // while a game still references the session: no cascade, no silent data
    // loss, and nothing is re-queued for a later flush.
    assert.ok(
      caught !== null,
      'a session that still has games must reject a delete'
    );
    assert.ok(
      (await journal.getSession(session.id)) !== null,
      'the session must survive the rejected delete'
    );
    assert.ok(
      (await journal.getLeague(league.id)) !== null,
      'the league must survive the rejected delete'
    );
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);
  } finally {
    harness.unmount();
  }
});

test('online: every journal callback writes locally; connectivity is not a mode switch', async () => {
  const harness = await mountHooks({ isConnected: true, type: 'wifi' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    // Connectivity is not a mode switch: an "online" game write still goes
    // straight to the local SQLite journal, returns the persisted local id, and
    // deletes locally rather than sending a mutation to the server.
    const gameLeague = await journal.createLeague({ name: 'Game League' });
    const gameSession = await journal.createSession({
      leagueId: gameLeague.id,
      date: '2025-01-05',
    });

    const createdGame = await harness.games.createGame({
      sessionId: gameSession.id as SessionId,
      date: '2025-01-05',
      clientSyncId: 'cs-game-1',
    });
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(createdGame)),
      'an online game write must return a local UUID'
    );
    assert.ok(
      (await journal.getGame(createdGame)) !== null,
      'the online game write must persist locally'
    );

    const removedGame = await harness.games.removeGame({
      gameId: createdGame as GameId,
    });
    assert.equal(removedGame, createdGame);
    assert.equal(await journal.getGame(createdGame), null);

    // Connectivity is not a mode switch: an "online" league write still goes
    // straight to the local SQLite journal and returns the persisted local id.
    const house = await journal.createHouse({ name: 'Fall House' });

    const createdLeague = await harness.leagues.createLeague({
      name: 'Fall League',
      houseId: house.id as never,
      leagueType: 'league',
    });
    assert.ok(LOCAL_UUID_PATTERN.test(String(createdLeague)));
    assert.ok(
      (await journal.getLeague(createdLeague)) !== null,
      'the online league write must persist locally'
    );

    const removedLeague = await harness.leagues.removeLeague({
      leagueId: createdLeague,
    });
    assert.equal(removedLeague, createdLeague);

    // Connectivity is not a mode switch: an "online" session write still goes
    // straight to the local SQLite journal and returns the persisted local id.
    const sessionLeague = await journal.createLeague({
      name: 'Session League',
    });

    const createdSession = await harness.sessions.createSession({
      leagueId: sessionLeague.id as LeagueId,
      date: '2025-01-05',
      houseId: house.id as never,
    });
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(createdSession)),
      'an online session write must return a local UUID'
    );

    const persistedSession = await journal.getSession(createdSession);
    assert.ok(
      persistedSession !== null,
      'the online session write must persist locally'
    );
    assert.equal(persistedSession.leagueId, sessionLeague.id);
    assert.equal(persistedSession.houseId, house.id);

    const removedSession = await harness.sessions.removeSession({
      sessionId: createdSession,
    });
    assert.equal(removedSession, createdSession);
    assert.equal(await journal.getSession(createdSession), null);

    // No journal callback binds a Convex mutation any more: the game, league,
    // and session callbacks all write locally, so nothing at all is recorded
    // against the sabotaged server even in the "online" state.
    assert.deepEqual(mutationCalls, []);

    // Ordinary online writes never touch the journal-create queue, and
    // neither does a local game, league, or session write.
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);

    // The league and the session survive their creates and their local deletes.
    assert.equal(await journal.getLeague(createdLeague), null);

    // The converted session path no longer resolves Convex reference ids, so
    // neither the session nor the league path loads the client-sync-map.
    assert.ok(
      !asyncStorageGetKeys.includes(CLIENT_SYNC_MAP_KEY),
      'local createSession must not load the client-sync-map'
    );
  } finally {
    harness.unmount();
  }
});

test('online to offline: league and session writes stay local without touching Convex', async () => {
  const harness = await mountHooks({ isConnected: true, type: 'wifi' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const onlineLeagueId = await harness.leagues.createLeague({
      name: 'Online League',
    });
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(onlineLeagueId)),
      'an online league write stays local'
    );
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);

    const createdSession = await harness.sessions.createSession({
      leagueId: onlineLeagueId,
      date: '2025-01-05',
      clientSyncId: 'cs-off-line',
    });
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(createdSession)),
      'an online session write stays local'
    );
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);

    harness.fake.emit({ isConnected: false, type: 'none' });

    // Crossing into offline does not switch the league hook back to the
    // legacy queue: the write stays local, keeps a local id, and adds no
    // entry.
    const offlineLeagueId = await harness.leagues.createLeague({
      name: 'Offline League',
      clientSyncId: 'cs-off-line',
    });
    assert.ok(
      !String(offlineLeagueId).startsWith('draft-'),
      'an offline league write stays local: no queue entry, no draft id'
    );
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);

    // Nor does it switch the session hook back: the offline write stays local
    // and returns a local UUID instead of a `draft-<clientSyncId>` phantom.
    const offlineSession = await harness.sessions.createSession({
      leagueId: onlineLeagueId,
      date: '2025-01-06',
      clientSyncId: 'cs-off-line',
    });
    assert.ok(
      !String(offlineSession).startsWith('draft-'),
      'an offline session write stays local: no queue entry, no draft id'
    );
    assert.ok(LOCAL_UUID_PATTERN.test(String(offlineSession)));
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);

    assert.deepEqual(
      (await journal.listSessions({ leagueId: onlineLeagueId })).map(
        (session) => session.date
      ),
      ['2025-01-05', '2025-01-06']
    );

    assert.deepEqual(
      (await journal.listLeagues()).map((league) => league.name),
      ['Offline League', 'Online League']
    );
  } finally {
    harness.unmount();
  }
});

test('offline to online: recovery keeps session writes local without restoring mutations', async () => {
  const harness = await mountHooks({ isConnected: false, type: 'none' });

  try {
    const { localJournal, database } = await getLocalReadModules();
    await database.closeDatabase();
    const journal = localJournal.getLocalJournalService();

    const league = await journal.createLeague({ name: 'Recovery League' });

    const offlineSessionId = await harness.sessions.createSession({
      leagueId: league.id as LeagueId,
      date: '2025-01-05',
    });
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(offlineSessionId)),
      'an offline session write stays local'
    );
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(mutationCalls.length, 0);

    harness.fake.emit({ isConnected: true, type: 'wifi' });

    // Recovery does not restore a Convex mutation for the session hook: the
    // write stays local, so nothing is re-sent to the server and no queued
    // entry is left waiting for a flusher.
    const onlineSessionId = await harness.sessions.createSession({
      leagueId: league.id as LeagueId,
      date: '2025-01-06',
    });
    assert.ok(
      LOCAL_UUID_PATTERN.test(String(onlineSessionId)),
      'recovery keeps the session write local: no mutation call is restored'
    );
    assert.notEqual(onlineSessionId, offlineSessionId);
    assert.equal(mutationCalls.length, 0);
    assert.equal(journalCreateQueue.length, 0);
    assert.equal(journalCreateQueuePersistCalls.length, 0);

    // Both sessions persisted against the same local league, and the local
    // ids are the ids the hook returned.
    assert.deepEqual(
      (await journal.listSessions({ leagueId: league.id })).map(
        (session) => session.id
      ),
      [offlineSessionId, onlineSessionId]
    );
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

// --- C-1b: game editor + reference data render from local SQLite -----------
//
// The two remaining read paths (use-game-editor's game/frames reads and
// use-reference-data's six reference reads) are proven to come from the
// local SQLite journal with the server sabotaged: the seeded journal is
// written through the real `LocalJournalService` (backed by the in-memory
// expo-sqlite stub) and the hooks must render it with zero Convex queries.

type EditorModule = typeof import('../../src/hooks/journal/use-game-editor');
type ReferenceDataModule =
  typeof import('../../src/hooks/journal/use-reference-data');
type LocalJournalModule = typeof import('../../src/services/local-journal');
type DatabaseModule = typeof import('../../src/db/database');

type LocalReadModules = {
  editor: EditorModule;
  referenceData: ReferenceDataModule;
  localJournal: LocalJournalModule;
  database: DatabaseModule;
};

let localReadModulesPromise: Promise<LocalReadModules> | null = null;

// Dynamic imports are required so the stub remaps (registered above) are in
// effect when these modules resolve their imports: the hooks reach
// `expo-sqlite` through `@/services/local-journal` -> `@/db/database`.
function getLocalReadModules(): Promise<LocalReadModules> {
  localReadModulesPromise ??= Promise.all([
    import('../../src/hooks/journal/use-game-editor'),
    import('../../src/hooks/journal/use-reference-data'),
    import('../../src/services/local-journal'),
    import('../../src/db/database'),
  ]).then(([editor, referenceData, localJournal, database]) => ({
    editor,
    referenceData,
    localJournal,
    database,
  }));

  return localReadModulesPromise;
}

const PROOF_DATE = '2025-01-05';
const PROOF_CREATION_TIME = Date.parse(`${PROOF_DATE}T00:00Z`);

type ProofSeed = {
  ballId: string;
  patternId: string;
  houseId: string;
  leagueId: string;
  sessionId: string;
  gameId: string;
};

// Writes one league -> session -> game (with three frames: a strike, an
// open frame, and an unstarted all-null frame) plus one ball, one pattern,
// and one house into a fresh in-memory local journal.
async function seedProofJournal(): Promise<ProofSeed> {
  const { localJournal, database } = await getLocalReadModules();

  await database.closeDatabase();

  const service = localJournal.getLocalJournalService();

  const ball = await service.createBall({ name: 'Storm Red', brand: 'Storm' });
  const pattern = await service.createPattern({ name: 'Classic' });
  const house = await service.createHouse({ name: 'Main Lanes' });
  const league = await service.createLeague({ name: 'Proof League' });
  const session = await service.createSession({
    leagueId: league.id,
    date: PROOF_DATE,
    weekNumber: 3,
    houseId: house.id,
  });
  const game = await service.createGame({
    sessionId: session.id,
    date: PROOF_DATE,
    houseId: house.id,
    ballId: ball.id,
    patternId: pattern.id,
    handicap: 0.2,
    notes: 'proof game',
    laneContext: { startingLane: 4 },
    ballSwitches: [{ frameNumber: 5, ballName: 'Storm Red' }],
  });
  await service.replaceGameFrames(game.id, [
    {
      frameNumber: 1,
      roll1Mask: FULL_PIN_MASK,
      roll2Mask: null,
      roll3Mask: null,
      pocket: 7,
    },
    { frameNumber: 2, roll1Mask: 0b101, roll2Mask: 0b010, footBoard: 2 },
    { frameNumber: 3, roll1Mask: null, roll2Mask: null, roll3Mask: null },
  ]);

  return {
    ballId: ball.id,
    patternId: pattern.id,
    houseId: house.id,
    leagueId: league.id,
    sessionId: session.id,
    gameId: game.id,
  };
}

test('sabotaged server: use-game-editor renders the game and frames from local SQLite', async () => {
  resetJournalHookStubs();

  let renderer: MiniReact | null = null;
  let editorApi: ReturnType<EditorModule['useGameEditor']> | null = null;

  try {
    const seed = await seedProofJournal();
    const { editor } = await getLocalReadModules();

    renderer = new MiniReact(() => {
      editorApi = editor.useGameEditor(seed.gameId as GameId);

      return null;
    }, __setActiveRenderer);
    renderer.mount();
    await settle();

    if (editorApi === null) {
      throw new Error('use-game-editor did not mount');
    }

    // Rebind through the declared return type: TS collapses a null-narrowed
    // deferred `ReturnType<...>` union to `never`.
    const api = editorApi as ReturnType<EditorModule['useGameEditor']>;

    // Zero server attempts: the sabotaged double records and throws on any
    // bound query, so the completed render proves no Convex read was bound.
    assert.deepEqual(convexOps, []);

    assert.equal(api.isSaving, false);
    assert.equal(api.isAuthenticated, true);
    assert.equal(api.isLoading, false);

    // The rendered game document mirrors the local row (with the session's
    // league and the derived provisional score) in the Convex document
    // shape the editor screen consumes.
    assert.ok(api.game !== null, 'game must render from the local read');
    assert.deepStrictEqual(api.game, {
      _id: seed.gameId,
      _creationTime: PROOF_CREATION_TIME,
      userId: LOCAL_JOURNAL_USER_ID,
      sessionId: seed.sessionId,
      leagueId: seed.leagueId,
      date: PROOF_DATE,
      totalScore: 16,
      strikes: 1,
      spares: 0,
      opens: 1,
      clientSyncId: null,
      ballId: seed.ballId,
      patternId: seed.patternId,
      handicap: 0.2,
      notes: 'proof game',
      laneContext: { leftLane: 0, rightLane: 0, lanePair: '', startingLane: 4 },
      ballSwitches: [{ frameNumber: 5, ballName: 'Storm Red' }],
      framePreview: null,
    });

    // Frames round-trip the authoritative pin masks (packed into `pins`) and
    // drop the unstarted all-null frame, exactly like the Convex list does.
    const frames: Frame[] | undefined = api.frames;
    assert.ok(Array.isArray(frames), 'frames must render from the local read');
    assert.equal(frames.length, 2);

    const [frameOne, frameTwo] = frames;
    assert.deepStrictEqual(frameOne, {
      _id: frameOne._id,
      _creationTime: PROOF_CREATION_TIME,
      userId: LOCAL_JOURNAL_USER_ID,
      gameId: seed.gameId,
      frameNumber: 1,
      roll1: 10,
      roll2: null,
      roll3: null,
      ballId: null,
      pins: packManualPins({
        roll1Mask: FULL_PIN_MASK,
        roll2Mask: null,
        roll3Mask: null,
      }),
      scores: null,
      score: null,
      flags: null,
      pocket: 7,
      footBoard: null,
      targetBoard: null,
    });
    assert.deepStrictEqual(frameTwo, {
      _id: frameTwo._id,
      _creationTime: PROOF_CREATION_TIME,
      userId: LOCAL_JOURNAL_USER_ID,
      gameId: seed.gameId,
      frameNumber: 2,
      roll1: 2,
      roll2: 1,
      roll3: null,
      ballId: null,
      pins: packManualPins({
        roll1Mask: 0b101,
        roll2Mask: 0b010,
        roll3Mask: null,
      }),
      scores: null,
      score: null,
      flags: null,
      pocket: null,
      footBoard: 2,
      targetBoard: null,
    });
  } finally {
    renderer?.unmount();
  }
});

test('sabotaged server: use-reference-data renders reference lists from local SQLite', async () => {
  resetJournalHookStubs();

  let renderer: MiniReact | null = null;
  let referenceApi: ReturnType<ReferenceDataModule['useReferenceData']> | null =
    null;

  try {
    const seed = await seedProofJournal();
    const { referenceData } = await getLocalReadModules();

    renderer = new MiniReact(() => {
      referenceApi = referenceData.useReferenceData();

      return null;
    }, __setActiveRenderer);
    renderer.mount();
    await settle();

    if (referenceApi === null) {
      throw new Error('use-reference-data did not mount');
    }

    // Rebind through the declared return type: TS collapses a null-narrowed
    // deferred `ReturnType<...>` union to `never`.
    const api = referenceApi as ReturnType<
      ReferenceDataModule['useReferenceData']
    >;

    // Zero server attempts for all six reference reads.
    assert.deepEqual(convexOps, []);

    const expectedBall = {
      id: seed.ballId,
      label: 'Storm Red',
      secondaryLabel: 'Storm',
    };
    const expectedPattern = {
      id: seed.patternId,
      label: 'Classic',
      secondaryLabel: null,
    };
    const expectedHouse = {
      id: seed.houseId,
      label: 'Main Lanes',
      secondaryLabel: null,
    };

    assert.deepEqual(api.ballOptions, [expectedBall]);
    assert.deepEqual(api.patternOptions, [expectedPattern]);
    assert.deepEqual(api.houseOptions, [expectedHouse]);
    assert.deepEqual(api.recentBallOptions, [expectedBall]);
    assert.deepEqual(api.recentPatternOptions, [expectedPattern]);
    assert.deepEqual(api.recentHouseOptions, [expectedHouse]);
  } finally {
    renderer?.unmount();
  }
});

// --- C-1c: home league + league games render from local SQLite -------------
//
// The last two derived reads (use-home-league's league summary list and
// use-league-games' per-league game stats) are proven to come from the
// local SQLite journal with the server sabotaged: the seeded local-read
// double serves league summaries derived from the seeded sessions (like
// the real adapter) and the hooks must render them with zero Convex
// queries. The fixture dates are relative to now because use-home-league
// applies the product's 3-month recency cutoff against the wall clock.

type HomeLeagueModule =
  typeof import('../../src/hooks/journal/use-home-league');
type LeagueGamesModule =
  typeof import('../../src/hooks/journal/use-league-games');

type C1cModules = {
  homeLeague: HomeLeagueModule;
  leagueGames: LeagueGamesModule;
};

let c1cModulesPromise: Promise<C1cModules> | null = null;

// Dynamic imports are required so the stub remaps (registered above) are in
// effect when the hooks resolve their imports.
function getC1cModules(): Promise<C1cModules> {
  c1cModulesPromise ??= Promise.all([
    import('../../src/hooks/journal/use-home-league'),
    import('../../src/hooks/journal/use-league-games'),
  ]).then(([homeLeague, leagueGames]) => ({ homeLeague, leagueGames }));

  return c1cModulesPromise;
}

function c1cDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

const C1C_LEAGUE_ID = 'c1c-league' as LeagueId;

const c1cLeague: League = {
  _id: C1C_LEAGUE_ID,
  _creationTime: 1736054400000,
  userId: 'local-user' as League['userId'],
  name: 'Home League',
  createdAt: 1736054400000,
  gamesPerSession: 3,
};

const c1cStaleLeague: League = {
  _id: 'c1c-stale-league' as LeagueId,
  _creationTime: 1736054400001,
  userId: 'local-user' as League['userId'],
  name: 'Stale League',
  createdAt: 1736054400001,
};

const c1cSessionOne: Session = {
  _id: 'c1c-session-1' as SessionId,
  _creationTime: 1736079600000,
  userId: 'local-user' as Session['userId'],
  leagueId: C1C_LEAGUE_ID,
  date: c1cDaysAgo(2),
};

const c1cSessionTwo: Session = {
  _id: 'c1c-session-2' as SessionId,
  _creationTime: 1736079600001,
  userId: 'local-user' as Session['userId'],
  leagueId: C1C_LEAGUE_ID,
  date: c1cDaysAgo(1),
};

// A session in a league whose last activity is older than the 3-month
// cutoff: it must keep that league out of the home league list.
const c1cStaleSession: Session = {
  _id: 'c1c-session-stale' as SessionId,
  _creationTime: 1736079600002,
  userId: 'local-user' as Session['userId'],
  leagueId: 'c1c-stale-league' as LeagueId,
  date: c1cDaysAgo(120),
};

// A session in a league that is not in the seeded league list: its game
// must stay out of the per-league game stats.
const c1cOtherSession: Session = {
  _id: 'c1c-session-other' as SessionId,
  _creationTime: 1736079600003,
  userId: 'local-user' as Session['userId'],
  leagueId: 'c1c-other-league' as LeagueId,
  date: c1cDaysAgo(3),
};

const c1cGameOne: GameListItem = {
  _id: 'c1c-game-1' as GameId,
  _creationTime: 1736079600010,
  userId: 'local-user' as GameListItem['userId'],
  sessionId: 'c1c-session-1' as SessionId,
  leagueId: C1C_LEAGUE_ID,
  date: c1cDaysAgo(2),
  totalScore: 200,
  strikes: 4,
  spares: 1,
  opens: 4,
};

const c1cGameTwo: GameListItem = {
  _id: 'c1c-game-2' as GameId,
  _creationTime: 1736079600011,
  userId: 'local-user' as GameListItem['userId'],
  sessionId: 'c1c-session-1' as SessionId,
  leagueId: C1C_LEAGUE_ID,
  date: c1cDaysAgo(2),
  totalScore: 150,
  strikes: 0,
  spares: 5,
  opens: 3,
};

const c1cGameThree: GameListItem = {
  _id: 'c1c-game-3' as GameId,
  _creationTime: 1736079600012,
  userId: 'local-user' as GameListItem['userId'],
  sessionId: 'c1c-session-2' as SessionId,
  leagueId: C1C_LEAGUE_ID,
  date: c1cDaysAgo(1),
  totalScore: 175,
  strikes: 1,
  spares: 2,
  opens: 6,
};

const c1cOtherGame: GameListItem = {
  _id: 'c1c-game-other' as GameId,
  _creationTime: 1736079600013,
  userId: 'local-user' as GameListItem['userId'],
  sessionId: 'c1c-session-other' as SessionId,
  leagueId: 'c1c-other-league' as LeagueId,
  date: c1cDaysAgo(3),
  totalScore: 999,
  strikes: 9,
  spares: 9,
  opens: 9,
};

const c1cStaleGame: GameListItem = {
  _id: 'c1c-game-stale' as GameId,
  _creationTime: 1736079600014,
  userId: 'local-user' as GameListItem['userId'],
  sessionId: 'c1c-session-stale' as SessionId,
  leagueId: 'c1c-stale-league' as LeagueId,
  date: c1cDaysAgo(120),
  totalScore: 10,
  strikes: 0,
  spares: 0,
  opens: 10,
};

test('sabotaged server: use-home-league and use-league-games render from local SQLite', async () => {
  const { homeLeague, leagueGames } = await getC1cModules();

  resetJournalHookStubs();
  setLocalReadSeed({
    leagues: [c1cLeague, c1cStaleLeague],
    sessions: [c1cSessionOne, c1cSessionTwo, c1cStaleSession, c1cOtherSession],
    games: [c1cGameOne, c1cGameTwo, c1cGameThree, c1cOtherGame, c1cStaleGame],
  });

  let renderer: MiniReact | null = null;
  let homeApi: ReturnType<HomeLeagueModule['useHomeLeague']> | null = null;
  let leagueGamesApi: ReturnType<LeagueGamesModule['useLeagueGames']> | null =
    null;
  let emptyLeagueGamesApi: ReturnType<
    LeagueGamesModule['useLeagueGames']
  > | null = null;

  try {
    renderer = new MiniReact(() => {
      homeApi = homeLeague.useHomeLeague();
      leagueGamesApi = leagueGames.useLeagueGames(C1C_LEAGUE_ID);
      emptyLeagueGamesApi = leagueGames.useLeagueGames(null);

      return null;
    }, __setActiveRenderer);
    renderer.mount();
    await settle();

    if (
      homeApi === null ||
      leagueGamesApi === null ||
      emptyLeagueGamesApi === null
    ) {
      throw new Error('C-1c hooks did not mount');
    }

    // Rebind through the declared return types: TS collapses the
    // null-narrowed deferred `ReturnType<...>` union to `never`.
    const home = homeApi as ReturnType<HomeLeagueModule['useHomeLeague']>;
    const games = leagueGamesApi as ReturnType<
      LeagueGamesModule['useLeagueGames']
    >;
    const emptyGames = emptyLeagueGamesApi as ReturnType<
      LeagueGamesModule['useLeagueGames']
    >;

    // Zero server attempts: the sabotaged double records and throws on any
    // bound query, so the completed render proves no Convex read was bound.
    assert.deepEqual(convexOps, []);

    // Every read went through the local adapter, in the component's hook
    // order (use-home-league, then use-league-games: the league's sessions,
    // then each session's games).
    assert.deepEqual(localReadCalls, [
      'listLocalLeagueSummaries',
      'listLocalSessionsByLeague',
      'listLocalGamesBySession',
      'listLocalGamesBySession',
    ]);

    // Home league: the seeded league summary (derived from the seeded
    // sessions) renders, and the league whose last activity is older than
    // the 3-month cutoff is cut off client-side.
    assert.equal(home.isLoading, false);
    assert.equal(home.hasLeagues, true);
    const expectedHomeLeague = {
      _id: 'c1c-league',
      name: 'Home League',
      houseName: null,
      gamesPerSession: 3,
      mostRecentSessionDate: c1cDaysAgo(1),
    };
    assert.deepStrictEqual(home.leagues, [expectedHomeLeague]);

    // With no saved preference the first displayed league is active.
    assert.deepStrictEqual(home.activeLeague, expectedHomeLeague);

    // League games: the off-league and stale-league games stay out; the
    // stats mirror the seeded games in local-read order.
    assert.equal(games.isLoading, false);
    assert.deepStrictEqual(games.games, [
      {
        _id: 'c1c-game-1',
        sessionId: 'c1c-session-1',
        totalScore: 200,
        strikes: 4,
        spares: 1,
        opens: 4,
      },
      {
        _id: 'c1c-game-2',
        sessionId: 'c1c-session-1',
        totalScore: 150,
        strikes: 0,
        spares: 5,
        opens: 3,
      },
      {
        _id: 'c1c-game-3',
        sessionId: 'c1c-session-2',
        totalScore: 175,
        strikes: 1,
        spares: 2,
        opens: 6,
      },
    ]);

    // A league-games read with no league selected renders nothing and is
    // not loading.
    assert.equal(emptyGames.isLoading, false);
    assert.deepStrictEqual(emptyGames.games, []);
  } finally {
    renderer?.unmount();
  }
});
