// Shared test doubles for the journal hook offline tests
// (`tests/hooks/journal-hooks-offline.test.ts`).
//
// One module is remapped (via registerHooks) onto every specifier the three
// journal hooks (`use-games`, `use-leagues`, `use-sessions`) import that
// cannot load under the plain Node/tsx runner:
//
//   'react'                                            -> mini hook dispatcher
//   'convex/react'                                     -> useMutation /
//                                                          useQuery /
//                                                          useConvexAuth
//   'react-native'                                     -> Platform
//   '@react-native-async-storage/async-storage'       -> in-memory
//                                                          getItem/setItem
//   '@/services/journal'                              -> convexJournalService
//   '@/services/journal/local-reads'                  -> empty local lists
//   '@/screens/journal/journal-create-queue-storage'  -> observable in-memory
//                                                          journal-create queue
//   './use-league-queue'                              -> identity passthrough
//
// The stub is a .ts module (not .mjs) so that every import of it — the test's
// static import and each remapped specifier — goes through the same tsx
// transform cache and therefore shares one module instance.
//
// Real modules run unmodified: `@/services/connectivity` (Phase 1 singleton),
// `@/screens/journal/journal-create-queue` (entry factories + upsert engine),
// `@/hooks/journal/reference-id-resolution`,
// `@/screens/journal/journal-client-sync-map-storage`,
// `@/screens/journal/reference-draft-id`, and `@/utils/client-sync-id`.

// --- Shared observable state ----------------------------------------------

// One entry per mutation invocation, in call order. The offline branch must
// leave this untouched; the online path must record the exact input.
export const mutationCalls: Array<{ name: string; input: unknown }> = [];

// AsyncStorage backing store, plus a record of every key read. Reading the
// client-sync-map key is how the real reference resolver
// (`resolveReferenceIdForMutation`) is observed: the offline branch must
// never reach it.
export const asyncStorageStore = new Map<string, string>();
export const asyncStorageGetKeys: string[] = [];

// Journal-create queue contents the storage double reports, and a record of
// each persisted queue, in call order.
export const journalCreateQueue: Array<Record<string, unknown>> = [];
export const journalCreateQueuePersistCalls: Array<
  Array<Record<string, unknown>>
> = [];

export function resetJournalHookStubs(): void {
  mutationCalls.length = 0;
  asyncStorageStore.clear();
  asyncStorageGetKeys.length = 0;
  journalCreateQueue.length = 0;
  journalCreateQueuePersistCalls.length = 0;
  __activeRenderer = null;
}

// --- 'react' double: mini hook dispatcher ---------------------------------
//
// The test file installs a small hook renderer (same hook-order contract as
// React) as the active renderer; these exports delegate to it.

type RendererHandle = {
  useState: (initial: unknown) => [unknown, (next: unknown) => void];
  useCallback: (
    callback: (...args: unknown[]) => unknown,
    deps: readonly unknown[] | undefined
  ) => (...args: unknown[]) => unknown;
  useMemo: <T>(factory: () => T, deps: readonly unknown[] | undefined) => T;
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
  return requireRenderer().useState(initial);
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

export function useEffect(
  effect: () => unknown | (() => void),
  deps: readonly unknown[] | undefined
): void {
  requireRenderer().useEffect(effect, deps);
}

// --- 'convex/react' double ------------------------------------------------
//
// The service references are arrow functions inside the object literal
// below, so `ref.name` is the service key. Each `useMutation` returns a
// fresh callable that records the input and resolves to a per-mutation
// sentinel id, so tests can assert both the exact input and the propagated
// return value. `useQuery` stays pending (undefined) so the hooks fall back
// to their cache state; `useConvexAuth` reports an authenticated, loaded
// session so the local-read effects are skipped.

export function useMutation(mutationRef: {
  name: string;
}): (input: unknown) => Promise<string> {
  return async (input: unknown) => {
    mutationCalls.push({ name: mutationRef.name, input });

    return `server-${mutationRef.name}`;
  };
}

export function useQuery(_queryRef: unknown, _args: unknown): undefined {
  return undefined;
}

export function useConvexAuth(): {
  isAuthenticated: boolean;
  isLoading: boolean;
} {
  return { isAuthenticated: true, isLoading: false };
}

// --- 'react-native' double -------------------------------------------------

export const Platform = { OS: 'ios' };

// --- '@react-native-async-storage/async-storage' double --------------------

const asyncStorage = {
  getItem: async (key: string) => {
    asyncStorageGetKeys.push(key);

    return asyncStorageStore.get(key) ?? null;
  },
  setItem: async (key: string, value: string) => {
    asyncStorageStore.set(key, value);
  },
  removeItem: async (key: string) => {
    asyncStorageStore.delete(key);
  },
};

export default asyncStorage;

// --- '@/services/journal' double -------------------------------------------

export const convexJournalService = {
  listGamesBySession: () => undefined,
  listLeagues: () => undefined,
  listSessionsByLeague: () => undefined,
  createGame: () => undefined,
  removeGame: () => undefined,
  createLeague: () => undefined,
  updateLeague: () => undefined,
  removeLeague: () => undefined,
  createSession: () => undefined,
  updateSession: () => undefined,
  removeSession: () => undefined,
};

// --- '@/services/journal/local-reads' double ------------------------------

export async function listLocalGamesBySession(
  _sessionId: unknown
): Promise<never[]> {
  return [];
}

export async function listLocalLeagues(): Promise<never[]> {
  return [];
}

export async function listLocalSessionsByLeague(
  _leagueId: unknown
): Promise<never[]> {
  return [];
}

// --- '@/screens/journal/journal-create-queue-storage' double ---------------
//
// In-memory journal-create queue. `loadJournalCreateQueue` returns a copy so
// tests observe what the hooks were handed, while `persistJournalCreateQueue`
// replaces the contents (mirroring the real storage contract).

export function loadJournalCreateQueue(): Promise<
  Array<Record<string, unknown>>
> {
  return Promise.resolve([...journalCreateQueue]);
}

export function persistJournalCreateQueue(
  entries: Array<Record<string, unknown>>
): Promise<void> {
  journalCreateQueue.length = 0;
  journalCreateQueue.push(...entries);
  journalCreateQueuePersistCalls.push(entries);

  return Promise.resolve();
}

// --- './use-league-queue' double -------------------------------------------

export function useLeagueQueue(params: { leagues: unknown[] }): {
  displayLeagues: unknown[];
} {
  return { displayLeagues: params.leagues };
}
