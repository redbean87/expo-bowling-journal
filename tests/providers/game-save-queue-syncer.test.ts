import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  __setActiveRenderer,
  __setAppState,
  convexJournalService,
  flushEventLog,
  gameSaveFlushCalls,
  journalFlushCalls,
  referenceFlushCalls,
  resetSyncerStubs,
  storageQueueEntries,
} from './stubs/syncer-stubs';
import { notifyQueueSyncStateChanged } from '../../src/screens/journal/queue-sync-events';
import { __connectivityTestControls } from '../../src/services/connectivity';

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
};

// Storage specifiers as seen from the real `queue-sync-presence` module.
const presenceStorageRewrites: Record<string, string> = {
  '../game-editor/game-save-queue-storage': stubPath,
  './journal-create-queue-storage': stubPath,
  './reference-create-queue-storage': stubPath,
};

const hookHandle = registerHooks({
  resolve(specifier, context, nextResolve) {
    const rewrites =
      context.parentURL === presenceModuleUrl
        ? { ...stubRewrites, ...presenceStorageRewrites }
        : stubRewrites;
    const rewritten = rewrites[specifier];

    if (rewritten) {
      return nextResolve(rewritten, context);
    }

    return nextResolve(specifier, context);
  },
});

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

// --- Mini hook renderer ---------------------------------------------------
//
// Implements the subset of React hooks the syncer uses, with the same
// hook-order, memo, and effect cleanup/dependency semantics the component
// relies on. State updates schedule a re-render pass on the microtask queue,
// mirroring React's batched passive-effect updates.

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
  private refs: Array<{ current: unknown } | undefined> = [];
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

  useRef<T>(initial: T): { current: T } {
    const index = this.hookIndex;
    this.hookIndex += 1;
    let ref = this.refs[index];

    if (ref === undefined) {
      ref = { current: initial };
      this.refs[index] = ref;
    }

    return ref as { current: T };
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

// --- Faked timers ---------------------------------------------------------
//
// Captures the syncer's `setTimeout`/`setInterval` calls so cadence (5000ms)
// and teardown (offline / no pending entries) can be asserted without
// waiting on real time. Timers only fire when the test fires them.

type TimerEntry = {
  id: number;
  type: 'timeout' | 'interval';
  delay: number;
  fn: () => void;
};

class FakeTimers {
  private timers = new Map<number, TimerEntry>();
  private nextId = 1;
  private originals: {
    setTimeout: typeof globalThis.setTimeout;
    setInterval: typeof globalThis.setInterval;
    clearTimeout: typeof globalThis.clearTimeout;
    clearInterval: typeof globalThis.clearInterval;
  } | null = null;

  install(): void {
    this.originals = {
      setTimeout: globalThis.setTimeout,
      setInterval: globalThis.setInterval,
      clearTimeout: globalThis.clearTimeout,
      clearInterval: globalThis.clearInterval,
    };
    (globalThis as { setTimeout: unknown }).setTimeout = (
      fn: () => void,
      delay?: number
    ) => this.schedule('timeout', fn, delay ?? 0);
    (globalThis as { setInterval: unknown }).setInterval = (
      fn: () => void,
      delay?: number
    ) => this.schedule('interval', fn, delay ?? 0);
    (globalThis as { clearTimeout: unknown }).clearTimeout = (id: number) => {
      this.timers.delete(id);
    };
    (globalThis as { clearInterval: unknown }).clearInterval = (id: number) => {
      this.timers.delete(id);
    };
  }

  restore(): void {
    if (this.originals === null) {
      return;
    }

    globalThis.setTimeout = this.originals.setTimeout;
    globalThis.setInterval = this.originals.setInterval;
    globalThis.clearTimeout = this.originals.clearTimeout;
    globalThis.clearInterval = this.originals.clearInterval;
    this.originals = null;
    this.timers.clear();
  }

  private schedule(
    type: 'timeout' | 'interval',
    fn: () => void,
    delay: number
  ): number {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { id, type, delay, fn });

    return id;
  }

  activeTimers(): TimerEntry[] {
    return [...this.timers.values()];
  }

  activeIntervals(): TimerEntry[] {
    return this.activeTimers().filter((timer) => timer.type === 'interval');
  }

  pendingTimeouts(): TimerEntry[] {
    return this.activeTimers().filter((timer) => timer.type === 'timeout');
  }

  fireTimeout(id: number): void {
    const timer = this.timers.get(id);

    if (timer === undefined) {
      throw new Error(`no pending timeout ${id}`);
    }

    this.timers.delete(id);
    timer.fn();
  }

  fireIntervalTick(intervalId: number): void {
    const timer = this.timers.get(intervalId);

    if (timer === undefined || timer.type !== 'interval') {
      throw new Error(`no active interval ${intervalId}`);
    }

    timer.fn();
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

// Mirrors the netinfo fake in `tests/connectivity.test.ts`: the initial
// state is delivered right after the source is subscribed (synchronously
// when `sync` is true, which exercises the singleton's known-state replay).
function createFakeNetInfo(
  initial: FakeNetInfoState,
  sync: boolean
): FakeNetInfo {
  let listener: ((state: FakeNetInfoState) => void) | null = null;
  let latest: FakeNetInfoState = initial;

  const mod: FakeNetInfoModule = {
    addEventListener(nextListener: (state: FakeNetInfoState) => void) {
      listener = nextListener;
      const state = latest;

      if (sync) {
        nextListener(state);
      } else {
        queueMicrotask(() => {
          nextListener(state);
        });
      }

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
  const renderer = new MiniReact(syncerModule.GameSaveQueueSyncer);
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
    // path (no remount, no foreground change).
    harness.fake.emit({ isConnected: true, type: 'wifi' });
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

    harness.fake.emit({ isConnected: true, type: 'wifi' });
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
