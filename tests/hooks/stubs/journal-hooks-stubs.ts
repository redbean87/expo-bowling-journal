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
//   '@/services/journal/local-reads'                  -> seeded local lists,
//                                                          every read recorded
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

import type { LocalLeagueSummaryView } from '../../../src/services/journal/local-reads';
import type {
  GameListItem,
  League,
  Session,
} from '../../../src/services/journal/types/core';

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
  convexOps.length = 0;
  localReadCalls.length = 0;
  localReadSeed.leagues.length = 0;
  localReadSeed.sessions.length = 0;
  localReadSeed.games.length = 0;
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

// `useStartTonight` keeps its one-shot guard in a ref, so the double delegates
// `useRef` to the renderer the same way it delegates the other hooks.
export function useRef<T>(initial: T): { current: T } {
  return requireRenderer().useRef(initial);
}

// --- 'convex/react' double ------------------------------------------------
//
// The server is sabotaged in this suite: `useQuery` records the attempted
// query in `convexOps` and throws, so any hook that still binds a Convex
// read fails the render. A query bound with `'skip'` never executes and
// records nothing, mirroring the C-0 local-first double. The service
// references are arrow functions inside the object literal below, so
// `ref.name` is the service key. Each `useMutation` returns a fresh
// callable that records the input and resolves to a per-mutation sentinel
// id, so tests can assert both the exact input and the propagated return
// value. `useConvexAuth` reports an authenticated, loaded session, so the
// pre-conversion auth-gated query args are attempted rather than skipped.

export const convexOps: string[] = [];

export function useMutation(mutationRef: {
  name: string;
}): (input: unknown) => Promise<string> {
  return async (input: unknown) => {
    mutationCalls.push({ name: mutationRef.name, input });

    return `server-${mutationRef.name}`;
  };
}

export function useQuery(queryRef: { name: string }, args: unknown): undefined {
  if (args === 'skip') {
    return undefined;
  }

  convexOps.push(`query:${queryRef.name}`);

  throw new Error(`Convex query attempted in local mode: ${queryRef.name}`);
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
  getGameById: () => undefined,
  listFramesByGame: () => undefined,
  listLeagues: () => undefined,
  listGameStatsByLeague: () => undefined,
  listSessionsByLeague: () => undefined,
  listBalls: () => undefined,
  listRecentBalls: () => undefined,
  listPatterns: () => undefined,
  listRecentPatterns: () => undefined,
  listHouses: () => undefined,
  listRecentHouses: () => undefined,
  createGame: () => undefined,
  removeGame: () => undefined,
  createLeague: () => undefined,
  updateLeague: () => undefined,
  removeLeague: () => undefined,
  createSession: () => undefined,
  updateSession: () => undefined,
  removeSession: () => undefined,
  createBall: () => undefined,
  createPattern: () => undefined,
  createHouse: () => undefined,
  updateGame: () => undefined,
  replaceFramesForGame: () => undefined,
};

// The documented local-journal sentinels (mirroring the real `local-reads`
// exports) so converted hooks that map local documents with them keep the
// same observable values under the remap.
export const LOCAL_JOURNAL_USER_ID: string =
  '00000000-0000-0000-0000-000000000000';
export const LOCAL_JOURNAL_OPEN_LEAGUE_ID: string =
  '00000000-0000-0000-0000-000000000000';

// --- '@/services/journal/local-reads' double ------------------------------
//
// Seeded local journal state standing in for the real SQLite-backed adapter:
// every read records itself in `localReadCalls` and reports the seeded
// documents (filtered the way the real adapter filters), so tests can assert
// the hooks render from local data and only through the local path.

export const localReadCalls: string[] = [];

export const localReadSeed: {
  leagues: League[];
  sessions: Session[];
  games: GameListItem[];
} = {
  leagues: [],
  sessions: [],
  games: [],
};

export function setLocalReadSeed(seed: {
  leagues: League[];
  sessions: Session[];
  games: GameListItem[];
}): void {
  localReadSeed.leagues.length = 0;
  localReadSeed.leagues.push(...seed.leagues);

  localReadSeed.sessions.length = 0;
  localReadSeed.sessions.push(...seed.sessions);

  localReadSeed.games.length = 0;
  localReadSeed.games.push(...seed.games);
}

export async function listLocalLeagues(): Promise<League[]> {
  localReadCalls.push('listLocalLeagues');

  return [...localReadSeed.leagues];
}

export async function listLocalSessionsByLeague(
  leagueId: unknown
): Promise<Session[]> {
  localReadCalls.push('listLocalSessionsByLeague');

  return localReadSeed.sessions.filter(
    (session) => session.leagueId === leagueId
  );
}

export async function listLocalGamesBySession(
  sessionId: unknown
): Promise<GameListItem[]> {
  localReadCalls.push('listLocalGamesBySession');

  return localReadSeed.games.filter((game) => game.sessionId === sessionId);
}

export async function listLocalLeagueSummaries(): Promise<
  LocalLeagueSummaryView[]
> {
  localReadCalls.push('listLocalLeagueSummaries');

  // Derive the view the real adapter derives: the most recent seeded session
  // date per league (null when the league has no sessions), ordered like the
  // real read (mostRecentSessionDate descending, nulls last).
  const summaries = localReadSeed.leagues.map((league) => {
    const sessionDates = localReadSeed.sessions
      .filter((session) => session.leagueId === league._id)
      .map((session) => session.date)
      .sort();

    return {
      _id: league._id,
      name: league.name,
      houseName: league.houseName ?? null,
      gamesPerSession: league.gamesPerSession ?? null,
      mostRecentSessionDate:
        sessionDates.length > 0 ? sessionDates[sessionDates.length - 1] : null,
    };
  });

  // Ordered like the real read: mostRecentSessionDate descending, nulls
  // last, ties keep the local service (seed) order.
  return [...summaries].sort((a, b) => {
    if (a.mostRecentSessionDate === null && b.mostRecentSessionDate === null) {
      return 0;
    }
    if (a.mostRecentSessionDate === null) {
      return 1;
    }
    if (b.mostRecentSessionDate === null) {
      return -1;
    }
    return b.mostRecentSessionDate.localeCompare(a.mostRecentSessionDate);
  });
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
