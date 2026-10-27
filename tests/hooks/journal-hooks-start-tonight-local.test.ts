// C-2 follow-up (bowl-c2-t3b T2): the start-tonight hook's local-first
// session create, driven with the REAL converted `createSession` callback.
//
// The C-2 verification (T10) found the start-tonight flow
// (`src/hooks/journal/use-start-tonight.ts`) still minting legacy journal-
// create-queue work: for a league row with no server league id it built a
// `createQueuedSessionCreateEntry`, persisted it through
// `journal-create-queue-storage`, refreshed the queued creates, and routed
// on a `draft-<clientSyncId>` session id, while the existing-session branch
// fell back to the same `draft-` phantom. The hook now awaits the converted,
// SQLite-backed `createSession` the app boundary already exposes (`use-
// sessions` → `src/services/journal/local-writes.ts`) and routes on the id
// that write returns.
//
// The suite therefore drives the hook with that same callback — the real
// write adapter, not a stand-in — so the session it proves is a session the
// real local journal persisted, and the rejection it proves is the canonical
// foreign key the real service enforces. Per scenario: a local league route
// writes to SQLite and navigates on the persisted id; a route that carries
// the local league id but no server league id (the guard the old hook
// returned on) still writes and navigates; a legacy `draft-` league route has
// no local league to hang a session on, so the foreign key rejects and the
// hook reports that rejection rather than queueing or routing on a phantom;
// an existing display session routes on its local id while a display row
// without one reports. In every scenario the legacy journal-create queue —
// including an entry a pre-C-2 run already persisted — is never read,
// written, or refreshed, and background sync and retry stay off.
//
// Shared fixtures are reused unchanged: `./stubs/journal-hooks-stubs.ts`
// (the react / AsyncStorage / journal-create-queue doubles) and
// `../db/expo-sqlite-stub.mjs`. `@/services/journal/local-writes` and the
// local journal service are deliberately NOT remapped: the write must run
// through the real app-boundary adapter and the real SQLite-backed service
// for the proving test to mean anything, and the queue double is what makes
// the "no new entry" and "historical entry untouched" assertions observable.

import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';

import { formatIsoDateForToday } from '../../src/screens/journal-fast-lane-utils';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';
import {
  __setActiveRenderer,
  convexOps,
  journalCreateQueue,
  journalCreateQueuePersistCalls,
  mutationCalls,
  resetJournalHookStubs,
} from './stubs/journal-hooks-stubs';

import type { DisplaySession } from '../../src/hooks/journal/use-session-queue';
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
  'expo-sqlite': path.join(__dirname, '..', 'db', 'expo-sqlite-stub.mjs'),
};

const hookHandle = registerStubRemaps(() => stubRewrites);

after(() => {
  hookHandle.deregister();
});

type StartTonightModule =
  typeof import('../../src/hooks/journal/use-start-tonight');
type LocalWritesModule =
  typeof import('../../src/services/journal/local-writes');
type LocalJournalModule = typeof import('../../src/services/local-journal');
type DatabaseModule = typeof import('../../src/db/database');

let appModulesPromise: Promise<{
  hook: StartTonightModule;
  localWrites: LocalWritesModule;
  localJournal: LocalJournalModule;
  database: DatabaseModule;
}> | null = null;

// Dynamic imports are required so the stub remaps (registered above) are in
// effect when the hook and the write adapter resolve their imports.
function getAppModules() {
  appModulesPromise ??= Promise.all([
    import('../../src/hooks/journal/use-start-tonight'),
    import('../../src/services/journal/local-writes'),
    import('../../src/services/local-journal'),
    import('../../src/db/database'),
  ]).then(([hook, localWrites, localJournal, database]) => ({
    hook,
    localWrites,
    localJournal,
    database,
  }));

  return appModulesPromise;
}

// The local UUID the SQLite-backed service mints for every canonical entity.
const LOCAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const START_TONIGHT_ROUTE = '/journal/[leagueId]/sessions/[sessionId]/games';

// --- Test harness ----------------------------------------------------------

// Drain microtasks and the promise chains they drive (the write adapter's
// SQLite promise chain, and the hook's own awaited create).
async function settle(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

// A fresh SQLite-backed journal for one test: the shared handle is closed so
// the next test starts from an empty database, and the returned service is
// the one the write adapter under test writes through.
async function openJournal(): Promise<
  ReturnType<LocalJournalModule['getLocalJournalService']>
> {
  const { localJournal, database } = await getAppModules();

  await database.closeDatabase();

  return localJournal.getLocalJournalService();
}

type RouteOptions = {
  pathname: string;
  params: Record<string, unknown>;
};

type SessionCreateRecord = {
  input: { leagueId: string; date: string };
  sessionId: string;
};

type StartTonightScenario = {
  leagueId: LeagueId | null;
  rawLeagueId: string | null;
  leagueClientSyncId: string | null;
  displaySessions: DisplaySession[];
  queuedEntries: Array<Record<string, unknown>>;
};

type StartTonightObservation = {
  errors: string[];
  navigations: RouteOptions[];
  sessionCreates: SessionCreateRecord[];
  queueRefreshes: string[];
  unmount(): void;
};

// Mount the REAL hook with the inputs the sessions screen would hand it,
// against the REAL converted `createSession` (the app-boundary write adapter
// `use-sessions` wires). The router is a recording double, so the route the
// hook builds — and the id it carries — is observable.
async function mountStartTonight(
  scenario: StartTonightScenario
): Promise<StartTonightObservation> {
  resetJournalHookStubs();
  journalCreateQueue.push(...scenario.queuedEntries);

  const { hook, localWrites } = await getAppModules();

  const errors: string[] = [];
  const navigations: RouteOptions[] = [];
  const sessionCreates: SessionCreateRecord[] = [];
  const queueRefreshes: string[] = [];

  const createSession = async (input: {
    leagueId: LeagueId;
    date: string;
  }): Promise<SessionId> => {
    // Record the attempt before the write resolves, so a rejected local
    // create is observable too: what the flow attempted is what matters.
    sessionCreates.push({
      input: { leagueId: input.leagueId, date: input.date },
      sessionId: '',
    });

    const sessionId = await localWrites.createSession(input);
    sessionCreates[sessionCreates.length - 1].sessionId = sessionId;

    return sessionId;
  };

  const router = {
    push: (options: RouteOptions) => {
      navigations.push({
        pathname: options.pathname,
        params: options.params,
      });
    },
    replace: (options: RouteOptions) => {
      navigations.push({
        pathname: options.pathname,
        params: options.params,
      });
    },
  } as never;

  const renderer = new MiniReact(() => {
    hook.useStartTonight({
      isFocused: true,
      startTonight: true,
      leagueId: scenario.leagueId,
      rawLeagueId: scenario.rawLeagueId,
      leagueClientSyncId: scenario.leagueClientSyncId,
      isSessionsLoading: false,
      isCreatingSession: false,
      displaySessions: scenario.displaySessions,
      createSession,
      refreshQueuedSessionCreates: async (): Promise<void> => {
        queueRefreshes.push('refresh');
      },
      router,
      onError: (message: string) => {
        errors.push(message);
      },
    });

    return null;
  }, __setActiveRenderer);

  renderer.mount();
  await settle();

  return {
    errors,
    navigations,
    sessionCreates,
    queueRefreshes,
    unmount(): void {
      renderer.unmount();
    },
  };
}

// The local-mode contract every start-tonight path must satisfy: the legacy
// queue is never refreshed, persisted, or written to, and no server path runs.
function assertNoLegacyQueueWork(
  scenario: string,
  observation: StartTonightObservation
): void {
  assert.equal(
    observation.queueRefreshes.length,
    0,
    `${scenario}: the hook must not refresh the legacy queued creates`
  );
  assert.equal(
    journalCreateQueuePersistCalls.length,
    0,
    `${scenario}: the hook must not persist the journal-create queue`
  );
  assert.equal(
    mutationCalls.length,
    0,
    `${scenario}: the hook must not run a server mutation`
  );
  assert.deepEqual(
    convexOps,
    [],
    `${scenario}: the hook must not touch Convex`
  );
}

// A session-create entry a pre-C-2 run already persisted in the legacy queue.
// The approved C-2 decision leaves historical entries untouched, so a local
// start-tonight flow must leave this one byte-for-byte as it found it.
function historicalSessionCreate(
  clientSyncId: string
): Record<string, unknown> {
  return {
    queueId: `session-create::${clientSyncId}`,
    entityType: 'session-create',
    clientSyncId,
    payload: {
      leagueId: null,
      leagueClientSyncId: clientSyncId,
      date: '2026-01-04',
    },
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: 1_700_000_000_000,
    lastError: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

// --- Tests -----------------------------------------------------------------

test('local mode: start tonight creates the session in SQLite and routes on the returned id', async () => {
  const journal = await openJournal();
  const league = await journal.createLeague({ name: 'Fall League' });
  const today = formatIsoDateForToday();

  const observation = await mountStartTonight({
    leagueId: league.id as LeagueId,
    rawLeagueId: league.id,
    leagueClientSyncId: null,
    displaySessions: [],
    queuedEntries: [],
  });

  try {
    assert.equal(
      observation.sessionCreates.length,
      1,
      'the flow must await the converted local createSession'
    );

    const create = observation.sessionCreates[0];
    assert.equal(
      create.input.leagueId,
      league.id,
      'the create must address the local league the route carries'
    );
    assert.equal(
      create.input.date,
      today,
      'the create must use today as the session date'
    );
    assert.ok(
      LOCAL_UUID_PATTERN.test(create.sessionId),
      'the create must return the persisted local UUID'
    );
    assert.ok(
      !create.sessionId.startsWith('draft-'),
      'the create must not return a draft id'
    );

    assert.equal(
      observation.navigations.length,
      1,
      'the flow must navigate once the session exists'
    );

    const navigation = observation.navigations[0];
    assert.equal(
      navigation.pathname,
      START_TONIGHT_ROUTE,
      'the flow must open the games route'
    );
    assert.equal(
      navigation.params.sessionId,
      create.sessionId,
      'navigation must use the id createSession returned'
    );
    assert.equal(
      navigation.params.leagueId,
      league.id,
      'navigation must keep the local league id'
    );
    assert.ok(
      !JSON.stringify(navigation.params).includes('draft-'),
      'the route must not carry a draft-prefixed id'
    );

    const persisted = await journal.getSession(create.sessionId as never);
    assert.ok(
      persisted !== null,
      'the created session must be persisted in SQLite'
    );
    assert.equal(
      persisted?.leagueId,
      league.id,
      'the persisted session must belong to the local league'
    );
    assert.equal(
      persisted?.date,
      today,
      'the persisted session must carry today as its date'
    );

    assert.equal(
      observation.errors.length,
      0,
      'a local create must not report a failure'
    );
    assert.equal(
      journalCreateQueue.length,
      0,
      'the legacy queue must stay empty'
    );

    assertNoLegacyQueueWork('a local start-tonight create', observation);
  } finally {
    observation.unmount();
  }
});

test('local mode: a local league route with no server league id still writes locally', async () => {
  const journal = await openJournal();
  const league = await journal.createLeague({ name: 'Route League' });
  const today = formatIsoDateForToday();

  // The route carries the local league id but no server `LeagueId`, which
  // is the case the old hook bailed out of with `if (!leagueId) return;`.
  const observation = await mountStartTonight({
    leagueId: null,
    rawLeagueId: league.id,
    leagueClientSyncId: null,
    displaySessions: [],
    queuedEntries: [],
  });

  try {
    assert.equal(
      observation.sessionCreates.length,
      1,
      'a route with a local league id must await the local create'
    );
    assert.equal(
      observation.sessionCreates[0].input.leagueId,
      league.id,
      'the create must address the local league id the route carries'
    );

    assert.equal(
      observation.navigations.length,
      1,
      'the flow must navigate on the locally created session'
    );
    assert.equal(
      observation.navigations[0].params.sessionId,
      observation.sessionCreates[0].sessionId,
      'navigation must use the returned local session id'
    );
    assert.ok(
      !JSON.stringify(observation.navigations[0].params).includes('draft-'),
      'the route must not carry a draft-prefixed id'
    );

    const persisted = await journal.getSession(
      observation.sessionCreates[0].sessionId as never
    );
    assert.ok(
      persisted !== null,
      'the session must be persisted in SQLite, not queued'
    );
    assert.equal(
      persisted?.leagueId,
      league.id,
      'the persisted session must belong to the local league the route carries'
    );
    assert.equal(
      persisted?.date,
      today,
      'the persisted session must carry today as its date'
    );

    assert.equal(
      observation.errors.length,
      0,
      'the local create must not report a failure'
    );
    assert.equal(
      journalCreateQueue.length,
      0,
      'a local league route must not enqueue a legacy entry'
    );

    assertNoLegacyQueueWork('a route-only local league', observation);
  } finally {
    observation.unmount();
  }
});

test('local mode: a legacy draft league route surfaces the rejection instead of queueing', async () => {
  const journal = await openJournal();
  const league = await journal.createLeague({ name: 'Local League' });
  const historicalEntry = historicalSessionCreate('cs-historical-league');

  const observation = await mountStartTonight({
    leagueId: null,
    rawLeagueId: 'draft-cs-historical-league',
    leagueClientSyncId: 'cs-historical-league',
    displaySessions: [],
    queuedEntries: [historicalEntry],
  });

  try {
    // The row's route carries only a legacy draft id, so there is no local
    // league to hang a session on: the create is attempted locally and the
    // canonical foreign key rejects it.
    assert.equal(
      observation.sessionCreates.length,
      1,
      'the flow must attempt the local create rather than queue'
    );
    assert.equal(
      observation.sessionCreates[0].input.leagueId,
      'draft-cs-historical-league',
      'the attempt must address the route id it was handed'
    );

    assert.equal(
      observation.errors.length,
      1,
      'the rejected create must be surfaced to the bowler'
    );
    assert.ok(
      /foreign key/i.test(observation.errors[0]),
      'the service rejection must reach the bowler unchanged'
    );

    assert.equal(
      observation.navigations.length,
      0,
      'a rejected create must not navigate to a phantom draft route'
    );

    assert.deepEqual(
      await journal.listSessions({ leagueId: league.id }),
      [],
      'a rejected create must not write a session into SQLite'
    );

    assert.deepEqual(
      journalCreateQueue,
      [historicalEntry],
      'a local start-tonight flow must leave historical queue entries untouched'
    );

    assertNoLegacyQueueWork('a legacy draft league route', observation);
  } finally {
    observation.unmount();
  }
});

test('local mode: an existing display session routes on its local id', async () => {
  const journal = await openJournal();
  const league = await journal.createLeague({ name: 'Tonight League' });
  const today = formatIsoDateForToday();
  const existing = await journal.createSession({
    leagueId: league.id,
    date: today,
    weekNumber: 3,
  });

  const observation = await mountStartTonight({
    leagueId: league.id as LeagueId,
    rawLeagueId: league.id,
    leagueClientSyncId: null,
    displaySessions: [
      {
        id: existing.id,
        sessionId: existing.id,
        clientSyncId: null,
        date: today,
        weekNumber: 3,
        houseId: null,
        patternId: null,
        ballId: null,
        isDraft: false,
      },
    ],
    queuedEntries: [],
  });

  try {
    assert.equal(
      observation.sessionCreates.length,
      0,
      'an existing local session must not be created again'
    );

    assert.equal(
      observation.navigations.length,
      1,
      'the flow must open the existing session'
    );
    assert.equal(
      observation.navigations[0].params.sessionId,
      existing.id,
      'the route must use the persisted local session id'
    );
    assert.equal(
      observation.navigations[0].params.startEntry,
      '1',
      'the route must still mark the start-entry step'
    );

    assert.equal(
      observation.errors.length,
      0,
      'routing on a local session must not report a failure'
    );
    assert.equal(
      journalCreateQueue.length,
      0,
      'the legacy queue must stay empty'
    );

    assertNoLegacyQueueWork('an existing local session', observation);
  } finally {
    observation.unmount();
  }
});

test('local mode: a display row with no local session id reports instead of routing', async () => {
  const journal = await openJournal();
  const today = formatIsoDateForToday();
  const historicalEntry = historicalSessionCreate('cs-draft-today');

  // The row the sessions screen shows for an already-persisted queue draft:
  // it matches today but has no local journal id to route on.
  const observation = await mountStartTonight({
    leagueId: null,
    rawLeagueId: 'draft-cs-draft-today',
    leagueClientSyncId: 'cs-draft-today',
    displaySessions: [
      {
        id: 'draft-row-today',
        sessionId: null,
        clientSyncId: 'cs-draft-today',
        date: today,
        weekNumber: null,
        houseId: null,
        patternId: null,
        ballId: null,
        isDraft: true,
      },
    ],
    queuedEntries: [historicalEntry],
  });

  try {
    assert.equal(
      observation.errors.length,
      1,
      'a display row with no local id must report rather than route'
    );
    assert.ok(
      !observation.errors[0].includes('draft-'),
      'the report must not expose a phantom draft id'
    );

    assert.equal(
      observation.navigations.length,
      0,
      'a display row with no local id must not mint a draft route'
    );
    assert.equal(
      observation.sessionCreates.length,
      0,
      'a display row with no local id must not create a second session'
    );

    assert.deepEqual(
      await journal.listSessions(),
      [],
      'a display row with no local id must not write a session into SQLite'
    );

    assert.deepEqual(
      journalCreateQueue,
      [historicalEntry],
      'the historical queue entry must stay untouched'
    );

    assertNoLegacyQueueWork('a draft display row', observation);
  } finally {
    observation.unmount();
  }
});
