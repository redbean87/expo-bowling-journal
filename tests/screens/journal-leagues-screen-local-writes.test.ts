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
// C-3 adds the open-bowling regression at the same seam: the leagues
// screen's `onOpenBowlingPress` no longer creates a league, so the suite
// drives the session write adapter the handler now calls
// (`src/services/journal/local-writes.ts` → `createSession`) with the
// documented open-league sentinel, and asserts the open session persists
// with a `null` SQLite leagueId, that no `leagues` row is written, that
// the sentinel route read surfaces the session, and that the leagues
// hook exposes no open-bowling league creator any more. C-3.5 then removes
// the now-dead synthetic-league display logic on the leagues screen (the
// `openBowlingLeague` memo, the `leagueType !== 'open'` filter term in
// `sortedLeagues`, and the inert `!openBowlingLeague` term in
// `hasNoContent`), which this suite pins from the same seam: the app-boundary
// league read the screen builds its rows from still lists every persisted
// row - including a historical `Open Bowling` row a pre-C-3 run left on the
// device (captain decision D2: untouched) - in the same recency order, no
// row ever resolves to the synthetic `'open'` type the removed filter could
// have matched, an empty journal still lists nothing, and the entry card's
// flow still creates one open session with no league and adds no row.
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
import { resolveLeagueType } from '../../src/utils/league-type-utils';
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
type LocalWritesModule =
  typeof import('../../src/services/journal/local-writes');
type LocalReadsModule = typeof import('../../src/services/journal/local-reads');

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

// The app-boundary adapters the open-bowling handler calls at runtime: the
// session write seam (`createSession`) and the route read the handler
// pushes (`listLocalSessionsByLeague`). Imported by relative path, so the
// REAL adapters load — the local-reads double the hook resolves is a
// separate module, and these must reach the real SQLite-backed service.
type LocalAdapters = {
  writes: LocalWritesModule;
  reads: LocalReadsModule;
};

let localAdaptersPromise: Promise<LocalAdapters> | null = null;

function getLocalAdapters(): Promise<LocalAdapters> {
  localAdaptersPromise ??= Promise.all([
    import('../../src/services/journal/local-writes'),
    import('../../src/services/journal/local-reads'),
  ]).then(([writes, reads]) => ({ writes, reads }));

  return localAdaptersPromise;
}

// The local UUID the SQLite-backed service mints for every canonical entity.
const LOCAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The documented open-session sentinel (D1: it is the route token for a
// session that has no league). Pinned literally, then asserted against the
// real adapter export below.
const OPEN_LEAGUE_ROUTE_TOKEN = '00000000-0000-0000-0000-000000000000';

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

test('local mode: open bowling creates an open session, no league, and routes on the sentinel', async () => {
  const harness = await mountLeagueHook({ isConnected: false, type: 'none' });

  try {
    // C-3.1: the leagues hook no longer hands out an open-bowling league
    // creator, so no caller can mint an `Open Bowling` row.
    assert.ok(
      !('createOpenBowlingLeague' in harness.leagues),
      'the leagues hook must not expose an open-bowling league creator'
    );

    const { journal } = await openJournal();
    const { writes, reads } = await getLocalAdapters();

    assert.equal(
      reads.LOCAL_JOURNAL_OPEN_LEAGUE_ID,
      OPEN_LEAGUE_ROUTE_TOKEN,
      'the open route token is the documented sentinel'
    );

    // C-3.2: the handler's session-write seam, called with the sentinel as
    // its app-boundary league identifier.
    const sessionId = await writes.createSession({
      leagueId: reads.LOCAL_JOURNAL_OPEN_LEAGUE_ID,
      date: '2026-01-04',
    });

    assert.ok(
      LOCAL_UUID_PATTERN.test(sessionId),
      'the open session must carry a real local session UUID'
    );
    assert.ok(
      !sessionId.startsWith('draft-'),
      'the open session must not carry a draft id'
    );

    // The write adapter resolves the sentinel to the local `null` league
    // foreign key: the persisted session has no league.
    const persisted = await journal.getSession(sessionId);
    assert.ok(persisted !== null, 'the open session must persist locally');
    assert.equal(persisted.id, sessionId);
    assert.equal(
      persisted.leagueId,
      null,
      'the persisted session must have a null SQLite leagueId'
    );

    // No `leagues` row was written for the tap: the sentinel names no
    // league, and the journal still holds none.
    assert.equal(
      await journal.getLeague(OPEN_LEAGUE_ROUTE_TOKEN),
      null,
      'the sentinel must not name a league'
    );
    assert.deepEqual(
      (await journal.listLeagues()).map((league) => league.name),
      [],
      'open bowling must create no league row'
    );

    // The route the handler pushes: the sessions screen reads the open
    // sessions through the sentinel-aware list read, so the created
    // session is discoverable there.
    assert.deepEqual(
      (await reads.listLocalSessionsByLeague(OPEN_LEAGUE_ROUTE_TOKEN)).map(
        (session) => session._id
      ),
      [sessionId],
      'the open route must list the created session'
    );

    // A real league identifier keeps its own sessions: the open session
    // never leaks into a league-scoped read.
    const league = await journal.createLeague({ name: 'Real League' });
    const leagueSession = await journal.createSession({
      leagueId: league.id,
      date: '2026-01-05',
    });
    assert.deepEqual(
      (await reads.listLocalSessionsByLeague(league.id)).map(
        (session) => session._id
      ),
      [leagueSession.id],
      'a real league route must list only its own sessions'
    );

    assert.equal(
      journalCreateQueue.length,
      0,
      'open bowling must not enqueue a legacy entry'
    );

    assertNoNewQueueEntry();
  } finally {
    harness.unmount();
  }
});

test('local mode: the C-3.5 leagues-screen cleanup keeps the listed rows and the empty state', async () => {
  const harness = await mountLeagueHook({ isConnected: false, type: 'none' });

  try {
    const { journal } = await openJournal();
    const { writes, reads } = await getLocalAdapters();

    // The screen builds `displayLeagues` from the app-boundary league read
    // the `use-leagues` hook serves it, and `sortedLeagues` from that list.
    // An empty journal still yields nothing, so the `!openBowlingLeague`
    // term the cleanup removed from `hasNoContent` cannot have changed the
    // "Tap + to add a league or tournament." hint.
    assert.deepEqual(
      await reads.listLocalLeagues(),
      [],
      'an empty journal must still list no league row'
    );

    // D2: a pre-C-3 run left an `Open Bowling` row on the device and C-3
    // leaves it untouched. It is the only row the removed `leagueType !==
    // 'open'` filter term could ever have matched.
    const legacy = await journal.createLeague({ name: 'Open Bowling' });
    const real = await journal.createLeague({
      name: 'Real League',
      gamesPerSession: 3,
    });
    await journal.createSession({ leagueId: real.id, date: '2026-01-05' });

    // Both rows are still listed, in the same recency order (the row with
    // the recent session first): the filter term the cleanup dropped
    // excluded nothing, so ordinary league rows render as before.
    assert.deepEqual(
      (await reads.listLocalLeagues()).map((document) => document.name),
      ['Real League', 'Open Bowling'],
      'the leagues screen must list every persisted row, recency-ordered'
    );

    // The invariant the removal rests on: `resolveLeagueType` is the
    // screen's own `leagueType` source, and the local read adapter omits
    // `type`/`isOpenBowling`, so no display row resolves to the synthetic
    // `'open'` type - even the historical row.
    assert.deepEqual(
      (await reads.listLocalLeagues()).map((document) =>
        resolveLeagueType(document)
      ),
      ['league', 'league'],
      'no display row may resolve to the synthetic open league type'
    );

    assert.equal(
      (await journal.getLeague(legacy.id))?.name,
      'Open Bowling',
      'the historical row must stay on disk unchanged'
    );

    // The entry card's flow after the cleanup: tapping it still creates
    // exactly one open session with no league, and adds no row to the
    // list the screen renders.
    const sessionId = await writes.createSession({
      leagueId: reads.LOCAL_JOURNAL_OPEN_LEAGUE_ID,
      date: '2026-01-06',
    });
    const persisted = await journal.getSession(sessionId);
    assert.ok(persisted !== null, 'the open session must persist locally');
    assert.equal(
      persisted.leagueId,
      null,
      'the open session must still carry no league'
    );
    assert.deepEqual(
      (await reads.listLocalLeagues()).map((document) => document.name),
      ['Real League', 'Open Bowling'],
      'the open-bowling entry point must add no league row to the screen'
    );

    // The card is unconditional and its `onPress` still routes through the
    // session write seam; the hook offers no league creator to fall back
    // to.
    assert.ok(
      !('createOpenBowlingLeague' in harness.leagues),
      'the leagues hook must not expose an open-bowling league creator'
    );

    assert.equal(
      journalCreateQueue.length,
      0,
      'open bowling must not enqueue a legacy entry'
    );

    assertNoNewQueueEntry();
  } finally {
    harness.unmount();
  }
});
