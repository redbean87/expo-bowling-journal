/**
 * C-2 T8 — app-level DURABLE write and deletion proving tests.
 *
 * The C-2 write tasks proved the routing half of the local-first write
 * contract: every application-facing write boundary (`use-leagues`,
 * `use-sessions`, `use-games`, `use-game-editor`, `use-reference-data`)
 * resolves its mutation callbacks to the app-boundary write adapter
 * (`src/services/journal/local-writes.ts`), which writes through the real
 * SQLite-backed local journal service. Those proofs read the entity back
 * from the SAME service instance, on an in-memory database, inside one
 * mounted app session.
 *
 * What they did not prove is the durability half — the boundary the app
 * actually crosses at runtime. A save has to survive the database being
 * closed and re-opened and the journal service being re-instantiated, the
 * way a save made before an app restart has to still be there afterwards.
 *
 * These tests therefore drive the REAL hooks through their write callbacks
 * against a FILE-BACKED test database — the `expo-sqlite` stub's seeding
 * seam (`globalThis.__bowlingJournalDbSeeds`, the same seam the C2
 * persistence test uses) — then close the shared handle and build a FRESH
 * `SqliteLocalJournalService` over that same file, and read the entity back
 * from that fresh service. A write that only lived in memory, or that went
 * to a legacy queue or a server mutation, fails the read-back.
 *
 * The game-delete test proves the approved deletion scope survives the same
 * restart boundary: the deleted game and its frames stay deleted, while the
 * parent session and its league stay present.
 *
 * Shared fixtures are reused unchanged: `tests/hooks/stubs/journal-hooks-
 * stubs.ts` (the react / convex / AsyncStorage / local-reads / journal-
 * create-queue doubles) and `tests/db/expo-sqlite-stub.mjs`. `@/services/
 * journal/local-writes`, `@/services/local-journal`, and the real
 * reference-create-queue and client-sync-map storages are deliberately NOT
 * remapped: the writes must run through the real app-boundary adapter and
 * the real SQLite-backed service for the proving test to mean anything, and
 * the real storages are what lets the "no new queue entry" assertions be
 * observed on the AsyncStorage double.
 */
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';

import {
  __setActiveRenderer,
  asyncStorageGetKeys,
  asyncStorageStore,
  convexOps,
  journalCreateQueue,
  journalCreateQueuePersistCalls,
  mutationCalls,
  resetJournalHookStubs,
} from './stubs/journal-hooks-stubs';
import {
  FULL_PIN_MASK,
  getRollValue,
  packManualPins,
} from '../../src/screens/game-editor/frame-mask-utils';
import { __connectivityTestControls } from '../../src/services/connectivity';
import { createFakeNetInfo } from '../harness/fake-env';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

import type {
  LeagueId,
  SessionId,
} from '../../src/services/journal/types/core';

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
type EditorModule = typeof import('../../src/hooks/journal/use-game-editor');
type ReferenceDataModule =
  typeof import('../../src/hooks/journal/use-reference-data');
type DatabaseModule = typeof import('../../src/db/database');
type LocalJournalModule = typeof import('../../src/services/local-journal');
type ServiceModule =
  typeof import('../../src/services/local-journal/sqlite-local-journal-service');

type Journal = InstanceType<ServiceModule['SqliteLocalJournalService']>;

type AppModules = {
  games: GamesModule;
  leagues: LeaguesModule;
  sessions: SessionsModule;
  editor: EditorModule;
  referenceData: ReferenceDataModule;
  database: DatabaseModule;
  localJournal: LocalJournalModule;
  service: ServiceModule;
};

let appModulesPromise: Promise<AppModules> | null = null;

// Dynamic imports are required so the stub remaps (registered above) are in
// effect when the hooks resolve their imports: the hooks reach `expo-sqlite`
// through `@/services/local-journal` -> `@/db/database`.
function getAppModules(): Promise<AppModules> {
  appModulesPromise ??= Promise.all([
    import('../../src/hooks/journal/use-games'),
    import('../../src/hooks/journal/use-leagues'),
    import('../../src/hooks/journal/use-sessions'),
    import('../../src/hooks/journal/use-game-editor'),
    import('../../src/hooks/journal/use-reference-data'),
    import('../../src/db/database'),
    import('../../src/services/local-journal'),
    import('../../src/services/local-journal/sqlite-local-journal-service'),
  ]).then(
    ([
      games,
      leagues,
      sessions,
      editor,
      referenceData,
      database,
      localJournal,
      service,
    ]) => ({
      games,
      leagues,
      sessions,
      editor,
      referenceData,
      database,
      localJournal,
      service,
    })
  );

  return appModulesPromise;
}

// --- The persistent (file-backed) test database ----------------------------

const SEAMS_KEY = '__bowlingJournalDbSeeds';
type Seams = Map<string, () => DatabaseSync>;

function setSeams(seams: Seams): void {
  (globalThis as unknown as Record<string, unknown>)[SEAMS_KEY] = seams;
}

function clearSeams(): void {
  const seams = (globalThis as unknown as Record<string, unknown>)[
    SEAMS_KEY
  ] as Seams | undefined;
  seams?.clear();
  (globalThis as unknown as Record<string, unknown>)[SEAMS_KEY] = undefined;
}

/**
 * How many times the seam factory has been asked for a `DatabaseSync`. The
 * stub calls it on every open, so a count above one after the restart proves
 * the read-back went through a RE-OPENED connection over the same file
 * rather than the connection that performed the write.
 */
let seamOpenCount = 0;

/**
 * Open the app's database lifecycle over a real file on disk: the seam
 * factory hands `openDatabaseAsync` a `DatabaseSync` bound to `file`, so
 * every open in this test writes through to that file and every reopen
 * (after `closeDatabase()`) reads it back.
 */
async function usePersistentDatabase(label: string): Promise<string> {
  const { database } = await getAppModules();
  const file = path.join(
    os.tmpdir(),
    `journal-hooks-local-writes-${label}-${process.pid}-${Date.now()}-${Math.round(
      Math.random() * 1_000_000
    )}.db`
  );
  const seams = new Map<string, () => DatabaseSync>();

  await database.closeDatabase();
  seamOpenCount = 0;
  seams.set(database.DATABASE_NAME, () => {
    seamOpenCount += 1;

    return new DatabaseSync(file);
  });
  setSeams(seams);

  return file;
}

/**
 * The restart boundary itself: close the shared handle (the stub's
 * `closeAsync` really closes the `DatabaseSync`, flushing the file) and
 * hand back a FRESH service instance. The next operation re-opens the
 * same file through the seam, so anything read back afterwards came from
 * disk, not from the service that performed the write.
 */
async function restartJournal(): Promise<Journal> {
  const { database, service } = await getAppModules();
  await database.closeDatabase();

  return new service.SqliteLocalJournalService();
}

/** Close whatever is open, drop the seam, and delete the test database. */
async function releasePersistentDatabase(file: string): Promise<void> {
  const { database } = await getAppModules();
  await database.closeDatabase();
  clearSeams();
  rmSync(file, { force: true });
}

// --- The hook mount --------------------------------------------------------

const mountedRenderers: MiniReact[] = [];

async function mountHooks(componentFn: () => null): Promise<MiniReact> {
  __connectivityTestControls.reset();
  resetJournalHookStubs();

  // Local mode is the only mode, and the write boundaries must not wait on
  // a network: mount with the live source reporting a definitively offline
  // device, so a write that still depended on connectivity or the server
  // would fail here rather than silently pass.
  const fake = createFakeNetInfo({ isConnected: false, type: 'none' }, true);
  __connectivityTestControls.useNetInfoModule(fake.mod);

  const renderer = new MiniReact(componentFn, __setActiveRenderer);
  renderer.mount();
  await settle();
  mountedRenderers.push(renderer);

  return renderer;
}

function unmountHooks(): void {
  while (mountedRenderers.length > 0) {
    mountedRenderers[mountedRenderers.length - 1].unmount();
    mountedRenderers.pop();
  }
}

// Drain microtasks and the promise chains they drive (the mount-time cache-
// load effects and the SQLite promise chains the hooks start).
async function settle(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

// The local UUID the SQLite-backed service mints for every canonical entity.
const LOCAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const CLIENT_SYNC_MAP_KEY = 'journal:client-sync-map:v1';
const REFERENCE_CREATE_QUEUE_KEY = 'journal:reference-create-queue:v1';
const JOURNAL_CREATE_QUEUE_KEY = 'journal:create-queue:v1';
const GAME_SAVE_QUEUE_KEY = 'journal:game-save-queue:v1';

/**
 * Snapshot of the observable write-path state, taken immediately before the
 * writes under test. The assertions below cover the write path itself, not
 * the reads a hook legitimately performs when it mounts — `use-reference-
 * data`, for example, loads the client-sync map as part of its mount-time
 * cache load, and that read is not a write.
 */
type WritePathObservation = {
  mutationCalls: number;
  convexOps: number;
  journalCreateQueue: number;
  journalCreateQueuePersistCalls: number;
  clientSyncMapReads: number;
};

function observeWritePath(): WritePathObservation {
  return {
    mutationCalls: mutationCalls.length,
    convexOps: convexOps.length,
    journalCreateQueue: journalCreateQueue.length,
    journalCreateQueuePersistCalls: journalCreateQueuePersistCalls.length,
    clientSyncMapReads: asyncStorageGetKeys.filter(
      (key) => key === CLIENT_SYNC_MAP_KEY
    ).length,
  };
}

/**
 * The local-mode regression every write boundary must satisfy: no server
 * mutation, no Convex query, no new entry in any legacy queue storage, and
 * no reference-id mapping step. The storages asserted here are the REAL
 * ones running on the AsyncStorage double, so a queue entry written by a
 * local write would show up.
 */
function assertNoServerOrQueueWrites(
  scenario: string,
  baseline: WritePathObservation
): void {
  assert.equal(
    mutationCalls.length - baseline.mutationCalls,
    0,
    `${scenario}: a local write must not call a Convex mutation`
  );
  assert.deepEqual(
    convexOps.slice(baseline.convexOps),
    [],
    `${scenario}: a local write must not bind a Convex query`
  );
  assert.equal(
    journalCreateQueue.length - baseline.journalCreateQueue,
    0,
    `${scenario}: a local write must not add a journal-create queue entry`
  );
  assert.equal(
    journalCreateQueuePersistCalls.length -
      baseline.journalCreateQueuePersistCalls,
    0,
    `${scenario}: a local write must not persist the journal-create queue`
  );
  assert.ok(
    !asyncStorageStore.has(REFERENCE_CREATE_QUEUE_KEY),
    `${scenario}: a local write must not write the reference-create queue`
  );
  assert.ok(
    !asyncStorageStore.has(JOURNAL_CREATE_QUEUE_KEY),
    `${scenario}: a local write must not write the journal-create queue storage`
  );
  assert.ok(
    !asyncStorageStore.has(GAME_SAVE_QUEUE_KEY),
    `${scenario}: a local write must not write the game-save queue`
  );
  assert.ok(
    !asyncStorageStore.has(CLIENT_SYNC_MAP_KEY),
    `${scenario}: a local write must not write the client-sync map`
  );
  assert.equal(
    asyncStorageGetKeys.filter((key) => key === CLIENT_SYNC_MAP_KEY).length -
      baseline.clientSyncMapReads,
    0,
    `${scenario}: the write path must not load the client-sync map (the Convex id-mapping step is gone)`
  );
}

/**
 * The read-back must have come from a re-opened connection over the same
 * file, not from the connection that performed the write.
 */
function assertReadBackFromDisk(scenario: string): void {
  assert.ok(
    seamOpenCount >= 2,
    `${scenario}: the read-back must have come from a re-opened connection over the same file`
  );
}

/**
 * Create the league -> session chain a game test needs, through the app
 * write boundaries themselves rather than a raw service call, so the
 * foreign keys the game tests assert are the ones the app would have
 * written. The league is named `Fall League`.
 */
async function createPrerequisiteSession(
  app: AppModules
): Promise<{ leagueId: LeagueId; sessionId: SessionId }> {
  let leaguesApi: ReturnType<LeaguesModule['useLeagues']> | null = null;
  await mountHooks(() => {
    leaguesApi = app.leagues.useLeagues();

    return null;
  });
  if (leaguesApi === null) {
    throw new Error('use-leagues did not mount');
  }

  const leagueId = await (
    leaguesApi as ReturnType<LeaguesModule['useLeagues']>
  ).createLeague({ name: 'Fall League' });

  let sessionsApi: ReturnType<SessionsModule['useSessions']> | null = null;
  await mountHooks(() => {
    sessionsApi = app.sessions.useSessions(leagueId);

    return null;
  });
  if (sessionsApi === null) {
    throw new Error('use-sessions did not mount');
  }

  const sessionId = await (
    sessionsApi as ReturnType<SessionsModule['useSessions']>
  ).createSession({ leagueId, date: '2025-01-05' });

  return { leagueId, sessionId };
}

/**
 * The two frames the editor tests write, in the transport shape the editor
 * screen sends (`EditableFrameInput`: roll counts plus the packed manual
 * pin set). Frame 1 is a 9/1 spare, frame 2 a strike.
 */
const EDITOR_FRAME_INPUTS = [
  {
    frameNumber: 1,
    roll1: 9,
    roll2: 1,
    roll3: null,
    pins: packManualPins({
      roll1Mask: 0b111111111,
      roll2Mask: 0b1000000000,
      roll3Mask: null,
    }),
  },
  {
    frameNumber: 2,
    roll1: 10,
    roll2: null,
    roll3: null,
    pins: packManualPins({
      roll1Mask: FULL_PIN_MASK,
      roll2Mask: null,
      roll3Mask: null,
    }),
  },
];

// --- Tests -----------------------------------------------------------------

test('local mode: a league created through use-leagues survives a closed database and a fresh service', async () => {
  const file = await usePersistentDatabase('league-write');

  try {
    const app = await getAppModules();
    let leaguesApi: ReturnType<LeaguesModule['useLeagues']> | null = null;

    await mountHooks(() => {
      leaguesApi = app.leagues.useLeagues();

      return null;
    });

    if (leaguesApi === null) {
      throw new Error('use-leagues did not mount');
    }

    // Rebind through the declared return type: TS collapses a null-narrowed
    // deferred `ReturnType<...>` union to `never`.
    const api = leaguesApi as ReturnType<LeaguesModule['useLeagues']>;

    const baseline = observeWritePath();

    const leagueId = await api.createLeague({
      name: 'Fall League',
      gamesPerSession: 5,
      houseName: 'Test House',
      startDate: '2025-01-01',
      endDate: '2025-04-30',
      clientSyncId: 'cs-league-1',
      leagueType: 'league',
    });
    assert.match(
      leagueId,
      LOCAL_UUID_PATTERN,
      'a local league create must return the persisted local UUID'
    );

    await settle();

    // The restart boundary: close the database, then read through a fresh
    // service instance over the same file.
    const restarted = await restartJournal();

    const persisted = await restarted.getLeague(leagueId);
    assert.ok(
      persisted !== null,
      'the created league must survive the restart'
    );
    assert.deepEqual(persisted, {
      id: leagueId,
      name: 'Fall League',
      gamesPerSession: 5,
      houseId: null,
      houseName: 'Test House',
      startDate: '2025-01-01',
      endDate: '2025-04-30',
    });
    assert.deepEqual(
      (await restarted.listLeagues()).map((league) => league.id),
      [leagueId]
    );

    assertReadBackFromDisk('a local league create');
    assertNoServerOrQueueWrites('a local league create', baseline);
  } finally {
    unmountHooks();
    await releasePersistentDatabase(file);
  }
});

test('local mode: a session created through use-sessions survives a restart and keeps its league foreign key', async () => {
  const file = await usePersistentDatabase('session-write');

  try {
    const app = await getAppModules();

    // The league the session hangs off is itself created through the app
    // boundary, so the foreign key under test is a real local UUID.
    let leaguesApi: ReturnType<LeaguesModule['useLeagues']> | null = null;
    await mountHooks(() => {
      leaguesApi = app.leagues.useLeagues();

      return null;
    });
    if (leaguesApi === null) {
      throw new Error('use-leagues did not mount');
    }
    const leagueId = await (
      leaguesApi as ReturnType<LeaguesModule['useLeagues']>
    ).createLeague({ name: 'Fall League' });

    let sessionsApi: ReturnType<SessionsModule['useSessions']> | null = null;
    await mountHooks(() => {
      sessionsApi = app.sessions.useSessions(leagueId);

      return null;
    });
    if (sessionsApi === null) {
      throw new Error('use-sessions did not mount');
    }

    const api = sessionsApi as ReturnType<SessionsModule['useSessions']>;

    const baseline = observeWritePath();

    const sessionId = await api.createSession({
      leagueId,
      date: '2025-01-05',
      weekNumber: 3,
      clientSyncId: 'cs-session-1',
    });
    assert.match(
      sessionId,
      LOCAL_UUID_PATTERN,
      'a local session create must return the persisted local UUID'
    );

    await settle();

    const restarted = await restartJournal();

    const persisted = await restarted.getSession(sessionId);
    assert.ok(
      persisted !== null,
      'the created session must survive the restart'
    );
    assert.deepEqual(persisted, {
      id: sessionId,
      leagueId,
      date: '2025-01-05',
      weekNumber: 3,
      houseId: null,
      ballId: null,
      patternId: null,
      notes: null,
      laneContext: null,
    });
    assert.deepEqual(
      (await restarted.listSessions()).map((session) => session.id),
      [sessionId]
    );
    assert.notEqual(
      await restarted.getLeague(leagueId),
      null,
      'the session must still be present'
    );

    assertReadBackFromDisk('a local session create');
    assertNoServerOrQueueWrites('a local session create', baseline);
  } finally {
    unmountHooks();
    await releasePersistentDatabase(file);
  }
});

test('local mode: reference-data creates survive a restart and keep their local ids', async () => {
  const file = await usePersistentDatabase('reference-write');

  try {
    const app = await getAppModules();
    let referenceApi: ReturnType<
      ReferenceDataModule['useReferenceData']
    > | null = null;

    await mountHooks(() => {
      referenceApi = app.referenceData.useReferenceData();

      return null;
    });
    if (referenceApi === null) {
      throw new Error('use-reference-data did not mount');
    }

    const api = referenceApi as ReturnType<
      ReferenceDataModule['useReferenceData']
    >;

    const baseline = observeWritePath();

    // The trimmed name is what the local service stores, and the returned
    // id is the persisted local UUID — never a `draft-…` phantom.
    const createdBall = await api.createBall('  Storm Blue  ');
    const createdPattern = await api.createPattern('Cheetah');
    const createdHouse = await api.createHouse('  Bowl  ');

    assert.match(
      createdBall.id,
      LOCAL_UUID_PATTERN,
      'a local ball create must return a local UUID'
    );
    assert.match(
      createdPattern.id,
      LOCAL_UUID_PATTERN,
      'a local pattern create must return a local UUID'
    );
    assert.match(
      createdHouse.id,
      LOCAL_UUID_PATTERN,
      'a local house create must return a local UUID'
    );
    assert.equal(createdBall.label, 'Storm Blue');
    assert.equal(createdPattern.label, 'Cheetah');
    assert.equal(createdHouse.label, 'Bowl');

    await settle();

    const restarted = await restartJournal();

    const persistedBall =
      (await restarted.listBalls()).find(
        (ball) => ball.id === createdBall.id
      ) ?? null;
    assert.ok(
      persistedBall !== null,
      'the created ball must survive the restart'
    );
    assert.equal(persistedBall.name, 'Storm Blue');
    assert.equal(persistedBall.brand, null);

    const persistedPattern =
      (await restarted.listPatterns()).find(
        (pattern) => pattern.id === createdPattern.id
      ) ?? null;
    assert.ok(
      persistedPattern !== null,
      'the created pattern must survive the restart'
    );
    assert.equal(persistedPattern.name, 'Cheetah');

    const persistedHouse =
      (await restarted.listHouses()).find(
        (house) => house.id === createdHouse.id
      ) ?? null;
    assert.ok(
      persistedHouse !== null,
      'the created house must survive the restart'
    );
    assert.equal(persistedHouse.name, 'Bowl');

    assertReadBackFromDisk('a local reference-data create');
    assertNoServerOrQueueWrites('a local reference-data create', baseline);
  } finally {
    unmountHooks();
    await releasePersistentDatabase(file);
  }
});

test('local mode: game-editor create, update, and frame writes survive a restart', async () => {
  const file = await usePersistentDatabase('editor-write');

  try {
    const app = await getAppModules();
    const { sessionId } = await createPrerequisiteSession(app);

    let editorApi: ReturnType<EditorModule['useGameEditor']> | null = null;
    await mountHooks(() => {
      editorApi = app.editor.useGameEditor(null);

      return null;
    });
    if (editorApi === null) {
      throw new Error('use-game-editor did not mount');
    }

    const api = editorApi as ReturnType<EditorModule['useGameEditor']>;

    const baseline = observeWritePath();

    // Create: the new game gets a local UUID (not a `draft-…` phantom),
    // keeps the session foreign key, and the draft nonce it was handed is
    // dropped — the adapter never stores a transport-only id.
    const gameId = await api.createGame({
      sessionId,
      date: '2025-01-07',
      clientSyncId: 'proof-draft-nonce',
    });
    assert.match(gameId, LOCAL_UUID_PATTERN);

    await api.replaceFramesForGame({
      gameId,
      frames: EDITOR_FRAME_INPUTS,
    });

    await api.updateGame({
      gameId,
      date: '2025-01-06',
    });
    assert.equal(api.isSaving, false);

    await settle();

    const restarted = await restartJournal();

    const persisted = await restarted.getGame(gameId);
    assert.ok(
      persisted !== null,
      'the editor-created game must survive the restart'
    );
    assert.equal(
      persisted.sessionId,
      sessionId,
      'the session foreign key must survive the restart'
    );
    assert.equal(
      persisted.date,
      '2025-01-06',
      'the editor header update must survive the restart'
    );

    const frames = await restarted.getGameFrames(gameId);
    assert.equal(
      frames.length,
      2,
      'the editor frame replacement must survive the restart'
    );
    assert.equal(frames[0].frameNumber, 1);
    assert.equal(getRollValue(frames[0].roll1Mask ?? null), 9);
    assert.equal(getRollValue(frames[0].roll2Mask ?? null), 1);
    assert.equal(frames[1].frameNumber, 2);
    assert.equal(getRollValue(frames[1].roll1Mask ?? null), 10);

    assertReadBackFromDisk('a local game-editor write');
    assertNoServerOrQueueWrites('a local game-editor write', baseline);
  } finally {
    unmountHooks();
    await releasePersistentDatabase(file);
  }
});

test('local mode: a game deleted through use-games stays deleted after a restart, and its session and league survive', async () => {
  const file = await usePersistentDatabase('game-delete');

  try {
    const app = await getAppModules();
    const { leagueId, sessionId } = await createPrerequisiteSession(app);

    let gamesApi: ReturnType<GamesModule['useGames']> | null = null;
    let editorApi: ReturnType<EditorModule['useGameEditor']> | null = null;
    await mountHooks(() => {
      gamesApi = app.games.useGames(sessionId);
      editorApi = app.editor.useGameEditor(null);

      return null;
    });
    if (gamesApi === null || editorApi === null) {
      throw new Error('The game write boundaries did not mount');
    }

    const games = gamesApi as ReturnType<GamesModule['useGames']>;
    const editor = editorApi as ReturnType<EditorModule['useGameEditor']>;

    const baseline = observeWritePath();

    const gameId = await games.createGame({
      sessionId,
      date: '2025-01-07',
      clientSyncId: 'cs-game-1',
    });
    assert.match(gameId, LOCAL_UUID_PATTERN);

    // Give the game frames, so the delete has real referencing rows to clear
    // and the approved game scope is observable, not vacuous.
    await editor.replaceFramesForGame({
      gameId,
      frames: EDITOR_FRAME_INPUTS,
    });

    await settle();

    const journal = app.localJournal.getLocalJournalService();
    assert.equal(
      (await journal.getGameFrames(gameId)).length,
      2,
      'the game must own persisted frames before the delete'
    );

    const deletedId = await games.removeGame({ gameId });
    assert.equal(
      deletedId,
      gameId,
      'a local delete returns the id it deleted, not the legacy silent null'
    );

    await settle();

    const restarted = await restartJournal();

    assert.strictEqual(
      await restarted.getGame(gameId),
      null,
      'the deleted game must still be gone after the restart'
    );
    assert.deepEqual(
      await restarted.getGameFrames(gameId),
      [],
      'the deleted game must not own any frame after the restart'
    );
    assert.deepEqual(
      (await restarted.listGames()).map((game) => game.id),
      [],
      'no game may survive the delete'
    );

    // The approved scope: the delete never cascades to the parent session
    // or its league, so both must still be there after the restart.
    const session = await restarted.getSession(sessionId);
    assert.ok(session !== null, 'the session must survive the game delete');
    assert.equal(
      session.leagueId,
      leagueId,
      'the session must still carry its league foreign key'
    );
    const league = await restarted.getLeague(leagueId);
    assert.ok(league !== null, 'the league must survive the game delete');
    assert.equal(league.name, 'Fall League');
    assert.deepEqual(
      (await restarted.listSessions()).map((entry) => entry.id),
      [sessionId]
    );
    assert.deepEqual(
      (await restarted.listLeagues()).map((entry) => entry.id),
      [league.id]
    );

    assertReadBackFromDisk('a local game delete');
    assertNoServerOrQueueWrites('a local game delete', baseline);
  } finally {
    unmountHooks();
    await releasePersistentDatabase(file);
  }
});

test('local mode: every app write boundary produces no server mutation, no Convex query, and no new queue entry', async () => {
  const file = await usePersistentDatabase('no-server-no-queue');

  try {
    const app = await getAppModules();

    let leaguesApi: ReturnType<LeaguesModule['useLeagues']> | null = null;
    let sessionsApi: ReturnType<SessionsModule['useSessions']> | null = null;
    let gamesApi: ReturnType<GamesModule['useGames']> | null = null;
    let editorApi: ReturnType<EditorModule['useGameEditor']> | null = null;
    let referenceApi: ReturnType<
      ReferenceDataModule['useReferenceData']
    > | null = null;

    // All five write boundaries mounted together, the way the running app
    // has them mounted at once.
    await mountHooks(() => {
      leaguesApi = app.leagues.useLeagues();
      sessionsApi = app.sessions.useSessions(null);
      gamesApi = app.games.useGames(null);
      editorApi = app.editor.useGameEditor(null);
      referenceApi = app.referenceData.useReferenceData();

      return null;
    });

    if (
      leaguesApi === null ||
      sessionsApi === null ||
      gamesApi === null ||
      editorApi === null ||
      referenceApi === null
    ) {
      throw new Error('The journal hooks did not mount');
    }

    const leagues = leaguesApi as ReturnType<LeaguesModule['useLeagues']>;
    const sessions = sessionsApi as ReturnType<SessionsModule['useSessions']>;
    const games = gamesApi as ReturnType<GamesModule['useGames']>;
    const editor = editorApi as ReturnType<EditorModule['useGameEditor']>;
    const reference = referenceApi as ReturnType<
      ReferenceDataModule['useReferenceData']
    >;

    const baseline = observeWritePath();

    const leagueId = await leagues.createLeague({ name: 'Fall League' });
    const sessionId = await sessions.createSession({
      leagueId,
      date: '2025-01-05',
    });
    const gameId = await games.createGame({
      sessionId,
      date: '2025-01-07',
      clientSyncId: 'cs-game-1',
    });
    await editor.replaceFramesForGame({
      gameId,
      frames: EDITOR_FRAME_INPUTS,
    });
    await editor.updateGame({ gameId, date: '2025-01-06' });
    await games.removeGame({ gameId });
    await reference.createBall('Storm Blue');
    await reference.createPattern('Cheetah');
    await reference.createHouse('Bowl');

    await settle();

    // The writes really did land, so the regression below is not vacuous.
    const restarted = await restartJournal();
    assert.notEqual(
      await restarted.getLeague(leagueId),
      null,
      'the league write must have landed'
    );
    assert.notEqual(
      await restarted.getSession(sessionId),
      null,
      'the session write must have landed'
    );
    assert.strictEqual(
      await restarted.getGame(gameId),
      null,
      'the game delete must have landed'
    );
    assert.equal(
      (await restarted.listBalls()).filter((ball) => ball.name === 'Storm Blue')
        .length,
      1,
      'the ball write must have landed'
    );
    assert.equal(
      (await restarted.listPatterns()).filter(
        (pattern) => pattern.name === 'Cheetah'
      ).length,
      1,
      'the pattern write must have landed'
    );
    assert.equal(
      (await restarted.listHouses()).filter((house) => house.name === 'Bowl')
        .length,
      1,
      'the house write must have landed'
    );

    assertReadBackFromDisk('every local app write boundary');
    assertNoServerOrQueueWrites('every local app write boundary', baseline);
  } finally {
    unmountHooks();
    await releasePersistentDatabase(file);
  }
});
