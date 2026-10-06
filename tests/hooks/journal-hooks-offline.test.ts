import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  __setActiveRenderer,
  asyncStorageGetKeys,
  journalCreateQueue,
  journalCreateQueuePersistCalls,
  mutationCalls,
  resetJournalHookStubs,
} from './stubs/journal-hooks-stubs';
import { __connectivityTestControls } from '../../src/services/connectivity';

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

const hookHandle = registerHooks({
  resolve(specifier, context, nextResolve) {
    const rewritten = stubRewrites[specifier];

    if (rewritten) {
      return nextResolve(rewritten, context);
    }

    return nextResolve(specifier, context);
  },
});

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

// --- Mini hook renderer ---------------------------------------------------
//
// Implements the subset of React hooks the three journal hooks use, with
// the same hook-order, memo, and effect cleanup/dependency semantics the
// hooks rely on. State updates schedule a re-render pass on the microtask
// queue, mirroring React's batched passive-effect updates.

type EffectEntry = {
  fn: (() => unknown) | null;
  pendingDeps: readonly unknown[] | null;
  deps: readonly unknown[] | null;
  hasRun: boolean;
  cleanup: (() => void) | null;
};

function shallowDepsEqual(
  a: readonly unknown[] | null,
  b: readonly unknown[] | null
): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null || a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => Object.is(value, b[index]));
}

class MiniReact {
  private hookIndex = 0;
  private states: unknown[] = [];
  private stateSeeds = new Set<number>();
  private memoCache: Array<{
    value: unknown;
    deps: readonly unknown[] | null;
  } | null> = [];
  private effects: EffectEntry[] = [];
  private effectSlot = 0;
  private commitScheduled = false;
  private unmounted = false;

  private readonly componentFn: () => null;

  constructor(componentFn: () => null) {
    this.componentFn = componentFn;
  }

  mount(): void {
    this.commit();
  }

  unmount(): void {
    this.unmounted = true;

    for (const effect of this.effects) {
      if (effect.cleanup !== null) {
        effect.cleanup();
      }
    }
  }

  private commit(): void {
    __setActiveRenderer(this);

    try {
      this.hookIndex = 0;
      this.effectSlot = 0;
      this.componentFn();
      this.runEffects();
    } finally {
      __setActiveRenderer(null);
    }
  }

  private scheduleCommit(): void {
    if (this.unmounted || this.commitScheduled) {
      return;
    }
    this.commitScheduled = true;
    queueMicrotask(() => {
      this.commitScheduled = false;
      if (!this.unmounted) {
        this.commit();
      }
    });
  }

  private runEffects(): void {
    for (const effect of this.effects) {
      const changed =
        !effect.hasRun || !shallowDepsEqual(effect.deps, effect.pendingDeps);

      if (!changed) {
        continue;
      }

      if (effect.cleanup !== null) {
        effect.cleanup();
      }

      const result = effect.fn === null ? undefined : effect.fn();

      effect.cleanup =
        typeof result === 'function' ? (result as () => void) : null;
      effect.deps = effect.pendingDeps;
      effect.hasRun = true;
    }
  }

  private ensureEffect(index: number): EffectEntry {
    let effect = this.effects[index];

    if (effect === undefined) {
      effect = {
        fn: null,
        pendingDeps: null,
        deps: null,
        hasRun: false,
        cleanup: null,
      };
      this.effects[index] = effect;
    }

    return effect;
  }

  useState(initial: unknown): [unknown, (next: unknown) => void] {
    const index = this.hookIndex;
    this.hookIndex += 1;

    if (!this.stateSeeds.has(index)) {
      this.stateSeeds.add(index);
      this.states[index] = initial;
    }

    const value = this.states[index];

    const setState = (next: unknown): void => {
      const resolved =
        typeof next === 'function'
          ? (next as (previous: unknown) => unknown)(this.states[index])
          : next;

      if (Object.is(this.states[index], resolved)) {
        return;
      }

      this.states[index] = resolved;
      this.scheduleCommit();
    };

    return [value, setState];
  }

  useCallback(
    callback: (...args: unknown[]) => unknown,
    deps: readonly unknown[] | undefined
  ): (...args: unknown[]) => unknown {
    const index = this.hookIndex;
    this.hookIndex += 1;
    const cached = this.memoCache[index] ?? null;

    if (cached !== null && shallowDepsEqual(cached.deps, deps ?? null)) {
      return cached.value as (...args: unknown[]) => unknown;
    }

    this.memoCache[index] = { value: callback, deps: deps ?? null };

    return callback;
  }

  useMemo<T>(factory: () => T, deps: readonly unknown[] | undefined): T {
    const index = this.hookIndex;
    this.hookIndex += 1;
    const cached = this.memoCache[index] ?? null;

    if (cached !== null && shallowDepsEqual(cached.deps, deps ?? null)) {
      return cached.value as T;
    }

    const value = factory();

    this.memoCache[index] = { value, deps: deps ?? null };

    return value;
  }

  useEffect(
    effect: () => unknown | (() => void),
    deps: readonly unknown[] | undefined
  ): void {
    // Effects are matched by per-render position (like React's hook list);
    // the slot index resets on every commit so entries persist across
    // re-renders instead of growing.
    const index = this.effectSlot;
    this.effectSlot += 1;
    this.hookIndex += 1;
    const entry = this.ensureEffect(index);

    entry.fn = effect;
    entry.pendingDeps = deps ?? null;
  }
}

// --- Simulated netinfo source ----------------------------------------------

type FakeNetInfoState = {
  isConnected: boolean | null;
  type: string;
};

type FakeNetInfoModule = {
  addEventListener(listener: (state: FakeNetInfoState) => void): () => void;
};

type FakeNetInfo = {
  mod: FakeNetInfoModule;
  emit(state: FakeNetInfoState): void;
};

// The initial state is delivered synchronously during subscription so the
// first `isConnectivityOffline()` call inside a hook callback — which is
// what triggers the singleton's initialization — already sees the intended
// state. Later `emit()` transitions are delivered synchronously as well.
function createFakeNetInfo(initial: FakeNetInfoState): FakeNetInfo {
  let listener: ((state: FakeNetInfoState) => void) | null = null;
  let latest: FakeNetInfoState = initial;

  const mod: FakeNetInfoModule = {
    addEventListener(nextListener: (state: FakeNetInfoState) => void) {
      listener = nextListener;
      nextListener(latest);

      return () => {
        if (listener === nextListener) {
          listener = null;
        }
      };
    },
  };

  return {
    mod,
    emit(state: FakeNetInfoState): void {
      latest = state;

      if (listener !== null) {
        listener(state);
      }
    },
  };
}

// --- Test harness ----------------------------------------------------------

type MountedHooks = {
  fake: FakeNetInfo;
  unmount(): void;
  games: ReturnType<GamesModule['useGames']>;
  leagues: ReturnType<LeaguesModule['useLeagues']>;
  sessions: ReturnType<SessionsModule['useSessions']>;
};

async function mountHooks(initial: FakeNetInfoState): Promise<MountedHooks> {
  __connectivityTestControls.reset();
  resetJournalHookStubs();

  const fake = createFakeNetInfo(initial);
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
  });
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
