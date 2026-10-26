import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  __setActiveRenderer,
  __setAppState,
  __setTestAuthState,
  convexJournalService,
  flushEventLog,
  gameSaveFlushCalls,
  journalFlushCalls,
  referenceFlushCalls,
  resetSyncerStubs,
  storageQueueEntries,
  waitForPresenceReads,
} from './stubs/syncer-stubs';
import { notifyQueueSyncStateChanged } from '../../src/screens/journal/queue-sync-events';
import { __connectivityTestControls } from '../../src/services/connectivity';
import {
  createFakeNetInfo,
  FakeTimers,
  type FakeNetInfo,
  type FakeNetInfoState,
} from '../harness/fake-env';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

// The syncer component runs under the plain Node/tsx runner with every
// un-Node-able import remapped to a local test double: 'react' (a mini hook
// dispatcher that implements the same hook-order contract React does),
// 'convex/react', 'react-native' (AppState), '@/services/journal', the three
// queue flush modules, the local draft storage module, and the three queue
// storage modules the real `queue-sync-presence` imports dynamically. The
// real connectivity singleton (`src/services/connectivity`) and the real
// queue-sync presence/events modules run unmodified; the netinfo source is
// simulated through `__connectivityTestControls`.
//
// Coverage notes:
// - The 5 second poll cadence, queue ordering, and flush wiring are asserted
//   below against the recorded flush calls and the faked interval.
// - In-flight locking, entry ordering, dedup, and retry backoff live in the
//   real flush modules (`*-queue-sync*`), which this change does not touch
//   and which are covered by their own tests.
// - The local-mode retry gate is asserted below against the same doubles:
//   `retryNow` (`src/hooks/journal/use-queue-sync-status.ts`) returns before
//   any pipeline runs while there is no session, and the cloud-mode case
//   still flushes all three with `force: true`.

const stubDir = path.join(__dirname, 'stubs');
const presenceModuleUrl = pathToFileURL(
  path.join(
    __dirname,
    '..',
    '..',
    'src',
    'screens',
    'journal',
    'queue-sync-presence.ts'
  )
).href;

// The stub file is a .ts module so that every import of it — the test's
// static import, the syncer's static imports, and the dynamic storage
// imports made by queue-sync-presence — resolves through tsx's shared
// transform cache and therefore shares one module instance. Specifiers
// are rewritten to the stub's absolute path and handed to the next
// resolver (tsx) instead of short-circuiting: a short-circuited file URL
// bypasses tsx's format decision and is evaluated as a separate native
// ESM instance by the dynamic imports.
const stubPath = path.join(stubDir, 'syncer-stubs.ts');
const stubRewrites: Record<string, string> = {
  react: stubPath,
  'convex/react': stubPath,
  'react-native': stubPath,
  '@/services/journal': stubPath,
  '@/screens/game-editor/game-local-draft-storage': stubPath,
  '@/screens/game-editor/game-save-queue-sync': stubPath,
  '@/screens/journal/journal-create-queue-sync': stubPath,
  '@/screens/journal/reference-create-queue-sync': stubPath,
  // Specifiers as `useQueueSyncStatus` sees them (the presence module above
  // reaches the same doubles through the relative specifiers below).
  '@/screens/game-editor/game-save-queue-storage': stubPath,
  '@/screens/journal/journal-create-queue-storage': stubPath,
  '@/screens/journal/reference-create-queue-storage': stubPath,
};

// Storage specifiers as seen from the real `queue-sync-presence` module.
const presenceStorageRewrites: Record<string, string> = {
  '../game-editor/game-save-queue-storage': stubPath,
  './journal-create-queue-storage': stubPath,
  './reference-create-queue-storage': stubPath,
};

const hookHandle = registerStubRemaps((parentURL) =>
  parentURL === presenceModuleUrl
    ? { ...stubRewrites, ...presenceStorageRewrites }
    : stubRewrites
);

after(() => {
  hookHandle.deregister();
});

type SyncerModule = typeof import('../../src/providers/game-save-queue-syncer');

let syncerModulePromise: Promise<SyncerModule> | null = null;

// Dynamic import is required so the stub remaps (registered above) are in
// effect when the component resolves its imports.
function getSyncerModule(): Promise<SyncerModule> {
  syncerModulePromise ??= import('../../src/providers/game-save-queue-syncer');

  return syncerModulePromise;
}

type QueueSyncStatusModule =
  typeof import('../../src/hooks/journal/use-queue-sync-status');

type QueueSyncStatusRender = ReturnType<
  QueueSyncStatusModule['useQueueSyncStatus']
>;

let queueSyncStatusModulePromise: Promise<QueueSyncStatusModule> | null = null;

// Dynamic import, same reason as the syncer: the stub remaps must already be
// registered when the hook resolves its own imports.
function getQueueSyncStatusModule(): Promise<QueueSyncStatusModule> {
  queueSyncStatusModulePromise ??=
    import('../../src/hooks/journal/use-queue-sync-status');

  return queueSyncStatusModulePromise;
}

// The hook object is captured by the render closure, so the test reads it
// through this seam rather than narrowing the closure variable itself.
function requireRenderedHook(
  rendered: QueueSyncStatusRender | null
): QueueSyncStatusRender {
  if (rendered === null) {
    throw new Error('useQueueSyncStatus did not render');
  }

  return rendered;
}

// --- Test harness ----------------------------------------------------------

type MountOptions = {
  sync?: boolean;
};

type Harness = {
  fake: FakeNetInfo;
  timers: FakeTimers;
  unmount(): void;
};

async function mountSyncer(
  initial: FakeNetInfoState,
  options: MountOptions = {}
): Promise<Harness> {
  __connectivityTestControls.reset();
  resetSyncerStubs();

  const fake = createFakeNetInfo(initial, options.sync === true);
  __connectivityTestControls.useNetInfoModule(fake.mod);

  const timers = new FakeTimers();
  timers.install();

  const syncerModule = await getSyncerModule();
  const renderer = new MiniReact(
    syncerModule.GameSaveQueueSyncer,
    __setActiveRenderer
  );
  renderer.mount();

  return {
    fake,
    timers,
    unmount(): void {
      renderer.unmount();
      timers.restore();
      __connectivityTestControls.reset();
    },
  };
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

// --- Tests -----------------------------------------------------------------

test('offline at mount: initial flush is gated, and offline-to-online restores without a remount', async () => {
  const harness = await mountSyncer({ isConnected: false, type: 'none' });

  try {
    storageQueueEntries.game.push({ id: 'game-1' });
    await settle();

    // The mount-time initial flush timer is pending; nothing has flushed
    // (in particular, no spurious restore fired from the mount replay).
    const initialTimeouts = harness.timers.pendingTimeouts();
    assert.equal(initialTimeouts.length, 1);
    assert.equal(flushEventLog.length, 0);
    harness.timers.fireTimeout(initialTimeouts[0].id);
    await settle();

    // Initial offline state gates the flush: no queue flush attempts, and no
    // poll interval while offline even with pending entries.
    assert.equal(flushEventLog.length, 0);
    assert.equal(harness.timers.activeIntervals().length, 0);

    // Connectivity restored on the same mount invokes the existing flush
    // path (no remount, no foreground change). The initial flush and the
    // restore each ran fire-and-forget refreshes (three storage doubles
    // each; the offline initial flushQueue also refreshes on its bail),
    // so wait for all six loader calls before asserting the arming.
    harness.fake.emit({ isConnected: true, type: 'wifi' });
    await waitForPresenceReads(12);
    await settle();

    assert.deepEqual(flushEventLog, [
      'reference-create',
      'journal-create',
      'game-save',
    ]);
    const intervals = harness.timers.activeIntervals();
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].delay, 5000);
  } finally {
    harness.unmount();
  }
});

test('connectivity restored flushes queued work without foreground or a remount', async () => {
  const harness = await mountSyncer({ isConnected: false, type: 'none' });

  try {
    storageQueueEntries.journal.push({ id: 'journal-1' });
    await settle();

    const [initialTimeout] = harness.timers.pendingTimeouts();
    harness.timers.fireTimeout(initialTimeout.id);
    await settle();

    assert.equal(flushEventLog.length, 0);

    __setAppState('background');
    await settle();
    assert.equal(flushEventLog.length, 0);

    harness.fake.emit({ isConnected: true, type: 'wifi' });
    await settle();

    // The restore flush happened although the app is backgrounded.
    assert.deepEqual(flushEventLog, [
      'reference-create',
      'journal-create',
      'game-save',
    ]);
    // No poll interval while backgrounded (existing gate); the restore
    // itself did not require it.
    assert.equal(harness.timers.activeIntervals().length, 0);
  } finally {
    harness.unmount();
  }
});

test('online mount polls on the 5 second cadence; offline clears the poller and gates ticks', async () => {
  const harness = await mountSyncer({ isConnected: true, type: 'wifi' });

  try {
    storageQueueEntries.game.push({ id: 'game-1' });
    await settle();

    const [initialTimeout] = harness.timers.pendingTimeouts();
    harness.timers.fireTimeout(initialTimeout.id);
    // The initial refresh and the online flush's tail refresh are
    // fire-and-forget (three storage doubles each): wait for both before
    // asserting the poller came up.
    await waitForPresenceReads(6);
    await settle();

    // Online initial flush ran and the poller came up at 5000ms.
    assert.equal(flushEventLog.length, 3);
    const intervals = harness.timers.activeIntervals();
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].delay, 5000);
    const tick = intervals[0].fn;

    // A poll tick flushes.
    tick();
    await settle();
    assert.equal(flushEventLog.length, 6);

    // Online-to-offline: the poller is cleared before any further tick.
    harness.fake.emit({ isConnected: false, type: 'none' });
    await settle();
    assert.equal(harness.timers.activeTimers().length, 0);
    assert.equal(flushEventLog.length, 6);

    // Any poll tick that still runs while offline bails before network work.
    tick();
    await settle();
    tick();
    await settle();
    assert.equal(flushEventLog.length, 6);

    // Ordering and wiring are preserved across both flushes: reference,
    // journal, then game, with the journal service mutations passed
    // through unchanged.
    assert.deepEqual(flushEventLog, [
      'reference-create',
      'journal-create',
      'game-save',
      'reference-create',
      'journal-create',
      'game-save',
    ]);
    assert.equal(referenceFlushCalls.length, 2);
    assert.equal(journalFlushCalls.length, 2);
    assert.equal(gameSaveFlushCalls.length, 2);

    for (const options of referenceFlushCalls) {
      assert.equal(options.createHouse, convexJournalService.createHouse);
      assert.equal(options.createPattern, convexJournalService.createPattern);
      assert.equal(options.createBall, convexJournalService.createBall);
    }
    for (const options of journalFlushCalls) {
      assert.equal(options.createLeague, convexJournalService.createLeague);
      assert.equal(options.updateLeague, convexJournalService.updateLeague);
      assert.equal(options.removeLeague, convexJournalService.removeLeague);
      assert.equal(options.createSession, convexJournalService.createSession);
      assert.equal(options.updateSession, convexJournalService.updateSession);
      assert.equal(options.removeSession, convexJournalService.removeSession);
    }
    for (const options of gameSaveFlushCalls) {
      assert.equal(options.createGame, convexJournalService.createGame);
      assert.equal(options.updateGame, convexJournalService.updateGame);
      assert.equal(
        options.replaceFramesForGame,
        convexJournalService.replaceFramesForGame
      );
      assert.equal(typeof options.onEntrySynced, 'function');
    }
  } finally {
    harness.unmount();
  }
});

test('queue sync state changes flush when active and online, and only refresh presence when offline', async () => {
  const harness = await mountSyncer({ isConnected: true, type: 'wifi' });

  try {
    storageQueueEntries.reference.push({ id: 'reference-1' });
    await settle();

    const [initialTimeout] = harness.timers.pendingTimeouts();
    harness.timers.fireTimeout(initialTimeout.id);
    await settle();
    assert.equal(flushEventLog.length, 3);

    notifyQueueSyncStateChanged();
    await settle();

    // Active + online: the existing notify -> flush behavior is preserved.
    assert.equal(flushEventLog.length, 6);

    harness.fake.emit({ isConnected: false, type: 'none' });
    await settle();

    notifyQueueSyncStateChanged();
    await settle();

    // Offline: notify still refreshes presence but makes no network attempt.
    assert.equal(flushEventLog.length, 6);
  } finally {
    harness.unmount();
  }
});

test('known offline state replayed at mount still gates flushes, then restores', async () => {
  const harness = await mountSyncer(
    { isConnected: false, type: 'none' },
    {
      sync: true,
    }
  );

  try {
    storageQueueEntries.game.push({ id: 'game-1' });
    await settle();

    // The replayed known offline state must not have triggered a restore.
    assert.equal(flushEventLog.length, 0);

    const [initialTimeout] = harness.timers.pendingTimeouts();
    harness.timers.fireTimeout(initialTimeout.id);
    await settle();
    assert.equal(flushEventLog.length, 0);
    assert.equal(harness.timers.activeIntervals().length, 0);

    // Same fire-and-forget refreshes as the first test (the offline
    // initial flush, then the restore flush): wait for all six loader
    // calls before asserting.
    harness.fake.emit({ isConnected: true, type: 'wifi' });
    await waitForPresenceReads(12);
    await settle();

    assert.deepEqual(flushEventLog, [
      'reference-create',
      'journal-create',
      'game-save',
    ]);
    const intervals = harness.timers.activeIntervals();
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].delay, 5000);
  } finally {
    harness.unmount();
  }
});

test('foregrounding the app still flushes queued work (existing app-state restore path)', async () => {
  const harness = await mountSyncer({ isConnected: true, type: 'wifi' });

  try {
    storageQueueEntries.game.push({ id: 'game-1' });
    await settle();

    const [initialTimeout] = harness.timers.pendingTimeouts();
    harness.timers.fireTimeout(initialTimeout.id);
    await settle();
    assert.equal(flushEventLog.length, 3);

    __setAppState('inactive');
    await settle();
    assert.equal(flushEventLog.length, 3);

    __setAppState('active');
    await settle();
    assert.equal(flushEventLog.length, 6);
  } finally {
    harness.unmount();
  }
});

test('no pending entries means no poll interval; queued work re-arms the 5 second cadence', async () => {
  const harness = await mountSyncer({ isConnected: true, type: 'wifi' });

  try {
    await settle();

    const [initialTimeout] = harness.timers.pendingTimeouts();
    harness.timers.fireTimeout(initialTimeout.id);
    await settle();

    // Online + active but nothing pending: the initial flush ran; no poller.
    assert.equal(flushEventLog.length, 3);
    assert.equal(harness.timers.activeIntervals().length, 0);

    storageQueueEntries.journal.push({ id: 'journal-1' });
    notifyQueueSyncStateChanged();
    // The notify refresh and its flush's tail refresh are fire-and-forget
    // (three storage doubles each; the mount-time initial flush already
    // accounted for the first six): wait for both before asserting.
    await waitForPresenceReads(12);
    await settle();

    // Queued work appeared: notify flushed and the poller came up at 5000ms.
    assert.equal(flushEventLog.length, 6);
    const intervals = harness.timers.activeIntervals();
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].delay, 5000);
  } finally {
    harness.unmount();
  }
});

// --- The retry affordance (`retryNow`) -------------------------------------
//
// `retryNow` is the user-facing retry: `src/screens/journal-leagues-screen.tsx`
// wires it to the league sync-status modal, and it flushes all three
// server-bound pipelines with `force: true`. In the approved local-mode
// configuration it stays a cloud affordance, so the gate must keep it from
// reaching any of those pipelines. The hook is mounted through the same stub
// remaps this suite already uses, so the assertions below observe the same
// flush doubles the syncer tests record.

test('local mode: retryNow is a no-op and cannot reach the server-bound pipelines', async () => {
  resetSyncerStubs();
  __setTestAuthState({ isAuthenticated: false, isLoading: false });

  // Pending work in all three legacy queues, so any flush attempt would be
  // recorded: an empty log then proves the gate, not an empty queue.
  storageQueueEntries.game.push({ id: 'game-1' });
  storageQueueEntries.journal.push({ id: 'journal-1' });
  storageQueueEntries.reference.push({ id: 'reference-1' });

  const queueSyncStatusModule = await getQueueSyncStatusModule();
  let rendered: QueueSyncStatusRender | null = null;

  const renderer = new MiniReact(() => {
    rendered = queueSyncStatusModule.useQueueSyncStatus();

    return null;
  }, __setActiveRenderer);

  try {
    renderer.mount();
    await settle();

    // The status hook still reports the pending entries, and nothing has
    // flushed on its own.
    assert.equal(requireRenderedHook(rendered).status.queuedCount, 3);
    assert.equal(flushEventLog.length, 0);

    await requireRenderedHook(rendered).retryNow();
    await settle();

    // Asking for a retry in local mode changes nothing: the auth gate returns
    // before the reference, journal, or game-save pipeline can run.
    assert.deepEqual(flushEventLog, []);
    assert.equal(referenceFlushCalls.length, 0);
    assert.equal(journalFlushCalls.length, 0);
    assert.equal(gameSaveFlushCalls.length, 0);

    const afterRetry = requireRenderedHook(rendered);
    assert.equal(afterRetry.isRetryingNow, false);
    assert.equal(afterRetry.status.state, 'queued');
    assert.equal(afterRetry.status.queuedCount, 3);
  } finally {
    renderer.unmount();
  }
});

test('cloud mode: retryNow still flushes all three server-bound pipelines', async () => {
  resetSyncerStubs();
  __setTestAuthState({ isAuthenticated: true, isLoading: false });

  storageQueueEntries.game.push({ id: 'game-1' });
  storageQueueEntries.journal.push({ id: 'journal-1' });
  storageQueueEntries.reference.push({ id: 'reference-1' });

  const queueSyncStatusModule = await getQueueSyncStatusModule();
  let rendered: QueueSyncStatusRender | null = null;

  const renderer = new MiniReact(() => {
    rendered = queueSyncStatusModule.useQueueSyncStatus();

    return null;
  }, __setActiveRenderer);

  try {
    renderer.mount();
    await settle();

    // Mounting the status hook never flushes; only an explicit retry does.
    assert.equal(flushEventLog.length, 0);

    await requireRenderedHook(rendered).retryNow();
    await settle();

    // Signed in, the existing retry behavior is unchanged: reference, journal,
    // then game saves, each forced.
    assert.deepEqual(flushEventLog, [
      'reference-create',
      'journal-create',
      'game-save',
    ]);
    assert.equal(referenceFlushCalls.length, 1);
    assert.equal(journalFlushCalls.length, 1);
    assert.equal(gameSaveFlushCalls.length, 1);

    for (const options of [
      ...referenceFlushCalls,
      ...journalFlushCalls,
      ...gameSaveFlushCalls,
    ]) {
      assert.equal(options.force, true);
    }

    assert.equal(requireRenderedHook(rendered).isRetryingNow, false);
  } finally {
    renderer.unmount();
  }
});
