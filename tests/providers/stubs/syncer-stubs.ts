// Shared test double for the GameSaveQueueSyncer component tests.
//
// One module is remapped (via registerHooks) onto every specifier the
// syncer imports that cannot load under the plain Node/tsx runner:
//
//   'react'                          -> mini hook dispatcher handle
//   'convex/react'                   -> useMutation
//   'react-native'                   -> AppState
//   '@/services/journal'             -> convexJournalService
//   '@/screens/game-editor/game-local-draft-storage'
//   '@/screens/game-editor/game-save-queue-sync'
//   '@/screens/journal/journal-create-queue-sync'
//   '@/screens/journal/reference-create-queue-sync'
//   '../game-editor/game-save-queue-storage'   (dynamic, from
//   './journal-create-queue-storage'              queue-sync-presence)
//   './reference-create-queue-storage'
//
// The stub is a .ts module (not .mjs) so that every import of it — the
// test's static import, the syncer's static imports, and the dynamic
// storage imports made by queue-sync-presence — goes through the same
// tsx transform cache and therefore shares one module instance.
//
// The test file imports this same module instance directly to drive and
// observe state; no real storage, network, or React renderer is involved.

// --- Shared observable state -------------------------------------------

// One entry per queue-flush attempt, in call order. Each full flush appends
// exactly ['reference-create', 'journal-create', 'game-save'] when the
// syncer's flush ordering is intact.
export const flushEventLog: string[] = [];
export const referenceFlushCalls: Array<Record<string, unknown>> = [];
export const journalFlushCalls: Array<Record<string, unknown>> = [];
export const gameSaveFlushCalls: Array<Record<string, unknown>> = [];
export const draftRemovals: unknown[] = [];

// Queue contents the storage doubles report. `loadQueueSyncPresence` only
// reads lengths, so plain marker objects are enough.
export const storageQueueEntries: {
  game: Array<Record<string, unknown>>;
  journal: Array<Record<string, unknown>>;
  reference: Array<Record<string, unknown>>;
} = {
  game: [],
  journal: [],
  reference: [],
};

export function resetSyncerStubs(): void {
  flushEventLog.length = 0;
  referenceFlushCalls.length = 0;
  journalFlushCalls.length = 0;
  gameSaveFlushCalls.length = 0;
  draftRemovals.length = 0;
  storageQueueEntries.game.length = 0;
  storageQueueEntries.journal.length = 0;
  storageQueueEntries.reference.length = 0;
  __activeRenderer = null;
  appStateListeners.clear();
  appState.current = 'active';
}

// --- 'react' double: mini hook dispatcher ------------------------------
//
// The test file installs a small hook renderer (same hook-order contract
// as React) as the active renderer; these exports delegate to it.

type RendererHandle = {
  useState: (initial: unknown) => unknown;
  useCallback: (
    callback: (...args: unknown[]) => unknown,
    deps: readonly unknown[] | undefined
  ) => (...args: unknown[]) => unknown;
  useMemo: <T>(factory: () => T, deps: readonly unknown[] | undefined) => T;
  useRef: <T>(initial: T) => { current: T };
  useEffect: (
    effect: () => unknown | (() => void),
    deps: readonly unknown[] | undefined
  ) => void;
};

let __activeRenderer: RendererHandle | null = null;

function requireRenderer(): RendererHandle {
  if (!__activeRenderer) {
    throw new Error('No active hook renderer');
  }

  return __activeRenderer;
}

export function __setActiveRenderer(renderer: RendererHandle | null): void {
  __activeRenderer = renderer;
}

export function useState(initial: unknown): [unknown, (next: unknown) => void] {
  return requireRenderer().useState(initial) as [
    unknown,
    (next: unknown) => void,
  ];
}

export function useCallback(
  callback: (...args: unknown[]) => unknown,
  deps: readonly unknown[] | undefined
): (...args: unknown[]) => unknown {
  return requireRenderer().useCallback(callback, deps);
}

export function useMemo<T>(
  factory: () => T,
  deps: readonly unknown[] | undefined
): T {
  return requireRenderer().useMemo(factory, deps);
}

export function useRef<T>(initial: T): { current: T } {
  return requireRenderer().useRef(initial);
}

export function useEffect(
  effect: () => unknown | (() => void),
  deps: readonly unknown[] | undefined
): void {
  requireRenderer().useEffect(effect, deps);
}

// --- 'convex/react' double ----------------------------------------------
//
// The "mutation" handed to the syncer is the service function itself, so
// the test can assert the syncer passes the journal service mutations
// through to the queue flushers unchanged.

export function useMutation<T>(mutationRef: T): T {
  return mutationRef;
}

// --- 'react-native' double (AppState only) ------------------------------

const appState: { current: string } = { current: 'active' };
const appStateListeners = new Set<(state: string) => void>();

export const AppState = {
  get currentState(): string {
    return appState.current;
  },
  addEventListener(
    type: string,
    handler: (state: string) => void
  ): { remove(): void } {
    appStateListeners.add(handler);
    return {
      remove(): void {
        appStateListeners.delete(handler);
      },
    };
  },
};

export function __setAppState(next: string): void {
  appState.current = next;
  for (const listener of [...appStateListeners]) {
    listener(next);
  }
}

// --- '@/services/journal' double ----------------------------------------

export const convexJournalService = {
  createGame: (): void => {},
  updateGame: (): void => {},
  replaceFramesForGame: (): void => {},
  createLeague: (): void => {},
  updateLeague: (): void => {},
  removeLeague: (): void => {},
  createSession: (): void => {},
  updateSession: (): void => {},
  removeSession: (): void => {},
  createBall: (): void => {},
  createPattern: (): void => {},
  createHouse: (): void => {},
};

// --- Queue flush doubles -------------------------------------------------
//
// Record the options the syncer passes; the in-flight lock, entry ordering,
// dedup, and backoff live in the real flush modules and are covered by
// their own tests, which this change does not touch. The doubles never
// mutate storageQueueEntries: draining is the real flush modules' job, and
// the presence read must observe the same entries the test queues.

type FlushOptions = Record<string, unknown>;

export function flushQueuedGameSavesWithLock(
  options: FlushOptions
): Promise<{ remainingEntries: unknown[] }> {
  gameSaveFlushCalls.push(options);
  flushEventLog.push('game-save');
  return Promise.resolve({ remainingEntries: [] });
}

export function flushJournalCreateQueueWithLock(
  options: FlushOptions
): Promise<{ remainingEntries: unknown[] }> {
  journalFlushCalls.push(options);
  flushEventLog.push('journal-create');
  return Promise.resolve({ remainingEntries: [] });
}

export function flushReferenceCreateQueueWithLock(
  options: FlushOptions
): Promise<{ remainingEntries: unknown[] }> {
  referenceFlushCalls.push(options);
  flushEventLog.push('reference-create');
  return Promise.resolve({ remainingEntries: [] });
}

// --- '@/screens/game-editor/game-local-draft-storage' double -------------

export function removeLocalGameDraft(originalQueueId: string): Promise<void> {
  draftRemovals.push(originalQueueId);
  return Promise.resolve();
}

// --- Queue storage doubles -------------------------------------------------
//
// Dynamically imported by the real `queue-sync-presence` module, which
// only reads entry counts.

export function loadGameSaveQueue(): Promise<Array<Record<string, unknown>>> {
  return Promise.resolve(storageQueueEntries.game);
}

export function loadJournalCreateQueue(): Promise<
  Array<Record<string, unknown>>
> {
  return Promise.resolve(storageQueueEntries.journal);
}

export function loadReferenceCreateQueue(): Promise<
  Array<Record<string, unknown>>
> {
  return Promise.resolve(storageQueueEntries.reference);
}
