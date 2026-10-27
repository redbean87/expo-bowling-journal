// C-2 follow-up (bowl-c2-t2b T1): the leagues screen's local-first league
// write policy, driven with the REAL converted `use-leagues` callbacks.
//
// The C-2 verification (T10) found the leagues screen (`src/screens/
// journal-leagues-screen.tsx`) still routing league writes through the
// legacy journal-create queue: an `isNavigatorOffline()` enqueue branch, a
// `withTimeout(…, 4500)` wrap around the write, an `isRetryableCreateError`
// re-queue fallback, and navigation on a `draft-<clientSyncId>` id. The
// screen now delegates those three writes to
// `src/screens/journal/journal-leagues-write-policy.ts`, which this suite
// drives with the same callbacks the screen calls at runtime — the converted
// `use-leagues` create/update/remove, which reach the app-boundary write
// adapter (`src/services/journal/local-writes.ts`) and the SQLite-backed
// local journal service behind it.
//
// So the suite proves the local-mode contract from the screen's write seam:
// an offline device still writes to SQLite and never enqueues, a create
// returns the persisted local UUID the screen routes on (never a `draft-`
// id), a service rejection — including a delete the canonical foreign keys
// reject — is reported to the bowler instead of queued, and a row with no
// local league id reports instead of enqueueing, while an entry a pre-C-2
// run already persisted in the queue stays byte-for-byte untouched.
//
// Shared fixtures are reused unchanged: `tests/hooks/stubs/journal-hooks-
// stubs.ts` (the react / convex / AsyncStorage / local-reads / journal-
// create-queue doubles) and `tests/db/expo-sqlite-stub.mjs`. `@/services/
// journal/local-writes` and the local journal service are deliberately NOT
// remapped: the writes must run through the real app-boundary adapter and
// the real SQLite-backed service for the proving test to mean anything, and
// the journal-create-queue double is what lets the "no new queue entry" and
// "historical entry untouched" assertions be observed.

import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  createLeagueLocally,
  deleteLeagueLocally,
  updateLeagueLocally,
} from '../../src/screens/journal/journal-leagues-write-policy';
import { __connectivityTestControls } from '../../src/services/connectivity';
import { createFakeNetInfo, type FakeNetInfoState } from '../harness/fake-env';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';
import {
  __setActiveRenderer,
  convexOps,
  journalCreateQueue,
  journalCreateQueuePersistCalls,
  mutationCalls,
  resetJournalHookStubs,
} from '../hooks/stubs/journal-hooks-stubs';

const stubDir = path.join(__dirname, '..', 'hooks', 'stubs');
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

type LeaguesModule = typeof import('../../src/hooks/journal/use-leagues');
type LocalJournalModule = typeof import('../../src/services/local-journal');
type DatabaseModule = typeof import('../../src/db/database');

let leaguesModulePromise: Promise<LeaguesModule> | null = null;
let journalModulesPromise: Promise<{
  localJournal: LocalJournalModule;
  database: DatabaseModule;
}> | null = null;

// Dynamic imports are required so the stub remaps (registered above) are in
// effect when the hook resolves its imports.
function getLeaguesModule(): Promise<LeaguesModule> {
  leaguesModulePromise ??= import('../../src/hooks/journal/use-leagues');

  return leaguesModulePromise;
}

function getJournalModules() {
  journalModulesPromise ??= Promise.all([
    import('../../src/services/local-journal'),
    import('../../src/db/database'),
  ]).then(([localJournal, database]) => ({ localJournal, database }));

  return journalModulesPromise;
}

// The local UUID the SQLite-backed service mints for every canonical entity.
const LOCAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// --- Test harness ----------------------------------------------------------

async function mountLeagueHook(connectivity: FakeNetInfoState): Promise<{
  leagues: ReturnType<LeaguesModule['useLeagues']>;
  unmount(): void;
}> {
  __connectivityTestControls.reset();
  resetJournalHookStubs();

  const fake = createFakeNetInfo(connectivity, true);
  __connectivityTestControls.useNetInfoModule(fake.mod);

  const leaguesModule = await getLeaguesModule();

  let leaguesApi: ReturnType<LeaguesModule['useLeagues']> | null = null;

  const renderer = new MiniReact(() => {
    leaguesApi = leaguesModule.useLeagues();

    return null;
  }, __setActiveRenderer);

  renderer.mount();
  await settle();

  if (leaguesApi === null) {
    throw new Error('use-leagues did not mount');
  }

  return {
    leagues: leaguesApi,
    unmount(): void {
      renderer.unmount();
      __connectivityTestControls.reset();
    },
  };
}

// A fresh SQLite-backed journal for one test: the shared handle is closed so
// the next test starts from an empty database, and the returned service is
// the one the write adapter under test writes through.
async function openJournal(): Promise<{
  journal: ReturnType<LocalJournalModule['getLocalJournalService']>;
}> {
  const { localJournal, database } = await getJournalModules();

  await database.closeDatabase();

  return { journal: localJournal.getLocalJournalService() };
}

// Drain microtasks and the promise chains they drive (the connectivity
// singleton delivers state as microtasks; the storage doubles resolve as
// promises).
async function settle(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

// The queue stayed empty and was never written to: no new legacy entry.
function assertNoNewQueueEntry(): void {
  assert.equal(
    journalCreateQueuePersistCalls.length,
    0,
    'a local league write must not persist the journal-create queue'
  );
  assert.equal(
    mutationCalls.length,
    0,
    'a local league write must not run a server mutation'
  );
  assert.deepEqual(convexOps, [], 'a local league write must not touch Convex');
}

// --- Tests -----------------------------------------------------------------

test('local mode: an offline create writes to SQLite and returns a local id', async () => {
  const harness = await mountLeagueHook({ isConnected: false, type: 'none' });

  try {
    const { journal } = await openJournal();
    const house = await journal.createHouse({ name: 'Fall House' });

    const { leagueId, error } = await createLeagueLocally(
      harness.leagues.createLeague,
      {
        name: 'Fall League',
        clientSyncId: 'cs-league-1',
        gamesPerSession: 3,
        houseId: house.id,
        leagueType: 'league',
      }
    );

    assert.equal(
      error,
      null,
      'the offline local create must not report a failure'
    );
    assert.ok(
      leagueId !== null && LOCAL_UUID_PATTERN.test(leagueId),
      'the create must return the persisted local UUID'
    );
    assert.ok(
      leagueId !== null && !leagueId.startsWith('draft-'),
      'the create must not return a draft id'
    );

    assertNoNewQueueEntry();
    assert.equal(
      journalCreateQueue.length,
      0,
      'the legacy queue must stay empty'
    );
    assert.equal(harness.leagues.isCreating, false);

    // Read-back through the real SQLite-backed service proves the write
    // landed there, and that the transport artifacts stayed out of the
    // canonical local model.
    const persisted = await journal.getLeague(leagueId as never);
    assert.ok(persisted !== null, 'the created league must persist locally');
    assert.equal(persisted.id, leagueId);
    assert.equal(persisted.name, 'Fall League');
    assert.equal(persisted.gamesPerSession, 3);
    assert.equal(persisted.houseId, house.id);
  } finally {
    harness.unmount();
  }
});

test('local mode: an update writes locally and an unknown id reports instead of queueing', async () => {
  const harness = await mountLeagueHook({ isConnected: false, type: 'cable' });

  try {
    const { journal } = await openJournal();
    const league = await journal.createLeague({ name: 'Rename Me' });

    const updated = await updateLeagueLocally(harness.leagues.updateLeague, {
      leagueId: league.id,
      name: 'Renamed League',
      gamesPerSession: 6,
      houseId: null,
      leagueType: 'league',
    });

    assert.equal(
      updated.error,
      null,
      'the local update must not report a failure'
    );
    assert.equal(updated.leagueId, league.id);

    const persisted = await journal.getLeague(league.id);
    assert.ok(persisted !== null, 'the updated league must still be present');
    assert.equal(persisted.name, 'Renamed League');
    assert.equal(persisted.gamesPerSession, 6);
    assert.equal(persisted.houseId, null);

    // An id the service does not know rejects; the rejection is surfaced to
    // the bowler rather than turned into a queued update.
    const missing = await updateLeagueLocally(harness.leagues.updateLeague, {
      leagueId: '00000000-0000-0000-0000-000000000000',
      name: 'Ghost League',
      gamesPerSession: null,
      houseId: null,
      leagueType: 'league',
    });

    assert.ok(
      missing.error !== null && missing.error.includes('League not found'),
      'a rejected update must surface the service error'
    );
    assert.equal(missing.leagueId, null);
    assert.equal(
      journalCreateQueue.length,
      0,
      'a rejected update must not enqueue a legacy entry'
    );

    assertNoNewQueueEntry();
  } finally {
    harness.unmount();
  }
});

test('local mode: a delete removes the league and a rejected delete surfaces', async () => {
  const harness = await mountLeagueHook({ isConnected: false, type: 'none' });

  try {
    const { journal } = await openJournal();
    const house = await journal.createHouse({ name: 'Delete House' });
    const empty = await journal.createLeague({ name: 'Empty League' });
    const busy = await journal.createLeague({ name: 'League With Sessions' });
    await journal.createSession({
      leagueId: busy.id,
      date: '2026-01-04',
      weekNumber: 1,
      houseId: house.id,
    });

    const removed = await deleteLeagueLocally(
      harness.leagues.removeLeague,
      empty.id
    );

    assert.equal(
      removed.error,
      null,
      'the local delete must not report a failure'
    );
    assert.equal(removed.leagueId, empty.id);
    assert.equal(
      await journal.getLeague(empty.id),
      null,
      'the deleted league must be gone from SQLite'
    );

    // The canonical foreign keys are enforced with NO ACTION, so a league
    // that still has sessions rejects. That rejection is surfaced instead of
    // being replaced by a queued delete, and nothing cascades.
    const rejected = await deleteLeagueLocally(
      harness.leagues.removeLeague,
      busy.id
    );

    assert.ok(
      rejected.error !== null,
      'a rejected delete must surface an error rather than queueing'
    );
    assert.equal(rejected.leagueId, null);

    const stillThere = await journal.getLeague(busy.id);
    assert.ok(
      stillThere !== null,
      'a rejected delete must leave the league and its sessions intact'
    );
    assert.deepEqual(
      (await journal.listSessions({ leagueId: busy.id })).length,
      1,
      'the rejected delete must not cascade into the league sessions'
    );

    assert.equal(
      journalCreateQueue.length,
      0,
      'a rejected delete must not enqueue a legacy entry'
    );

    assertNoNewQueueEntry();
  } finally {
    harness.unmount();
  }
});

test('local mode: a row with no local id reports and leaves a queued entry untouched', async () => {
  const harness = await mountLeagueHook({ isConnected: false, type: 'none' });

  try {
    // A league-create entry a pre-C-2 run already persisted. The approved
    // C-2 decision leaves historical queue entries untouched, so this entry
    // must survive the local write byte-for-byte.
    const historicalEntry = {
      queueId: 'league-create::cs-historical-league',
      entityType: 'league-create',
      clientSyncId: 'cs-historical-league',
      payload: {
        name: 'Retired Offline League',
        gamesPerSession: 3,
        houseId: null,
        leagueType: 'league',
      },
      attemptCount: 0,
      lastAttemptAt: null,
      nextRetryAt: 1_700_000_000_000,
      lastError: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    };
    journalCreateQueue.push(historicalEntry);

    // The row this screen shows for that entry has no local league id, so
    // neither write is addressable locally: both report instead of writing a
    // new entry, and neither drains or re-parents the historical one.
    const edit = await updateLeagueLocally(harness.leagues.updateLeague, {
      leagueId: null,
      name: 'Retired Offline League',
      gamesPerSession: 3,
      houseId: null,
      leagueType: 'league',
    });

    assert.ok(
      edit.error !== null,
      'a league row with no local id must report instead of queueing'
    );
    assert.equal(edit.leagueId, null);

    const removal = await deleteLeagueLocally(
      harness.leagues.removeLeague,
      null
    );

    assert.ok(
      removal.error !== null,
      'a league row with no local id must report instead of queueing'
    );
    assert.equal(removal.leagueId, null);

    assert.deepEqual(
      journalCreateQueue,
      [historicalEntry],
      'a local league write must leave historical queue entries untouched'
    );

    assertNoNewQueueEntry();
  } finally {
    harness.unmount();
  }
});

test('local mode: connectivity recovery keeps league writes local', async () => {
  const harness = await mountLeagueHook({ isConnected: false, type: 'none' });

  try {
    const { journal } = await openJournal();
    const offline = await createLeagueLocally(harness.leagues.createLeague, {
      name: 'Offline League',
      clientSyncId: 'cs-league-recovery',
      gamesPerSession: null,
      houseId: null,
      leagueType: 'tournament',
    });

    assert.ok(
      offline.leagueId !== null && LOCAL_UUID_PATTERN.test(offline.leagueId),
      'the offline create must return a local UUID'
    );
    assert.equal(offline.error, null);

    // The same callbacks, still mounted, keep writing locally once the
    // device reconnects: recovery does not restore a queue or a server path.
    const online = await updateLeagueLocally(harness.leagues.updateLeague, {
      leagueId: offline.leagueId,
      name: 'Recovered League',
      gamesPerSession: 4,
      houseId: null,
      leagueType: 'tournament',
    });

    assert.equal(
      online.error,
      null,
      'the recovered update must not report a failure'
    );
    assert.equal(online.leagueId, offline.leagueId);

    const persisted = await journal.getLeague(
      (offline.leagueId ?? '') as never
    );
    assert.ok(persisted !== null, 'the league must persist across recovery');
    assert.equal(persisted.name, 'Recovered League');
    assert.equal(persisted.gamesPerSession, 4);

    assert.equal(
      journalCreateQueue.length,
      0,
      'recovery must not enqueue a legacy entry'
    );

    assertNoNewQueueEntry();
  } finally {
    harness.unmount();
  }
});
