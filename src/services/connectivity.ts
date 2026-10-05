/**
 * Live connectivity singleton.
 *
 * Single source of connectivity state for the whole app:
 *
 * - State comes from `@react-native-community/netinfo` (the native
 *   module on iOS/Android, its window/navigator-based implementation on
 *   web). The module is loaded dynamically so environments without the
 *   React Native runtime (e.g. the Node test runner) keep working.
 * - If the netinfo module cannot be loaded in the current environment,
 *   the singleton falls back to `navigator.onLine` plus the standard
 *   `online`/`offline` events on the global scope.
 *
 * Contract (preserved from the previous `isNavigatorOffline` check):
 * `isConnectivityOffline()` returns true only when the live source has
 * reported a definitively offline state. An unknown state (no source,
 * or before the first event arrives) is not offline, and signal-strength
 * or reachability details are never interpreted here.
 */

export type ConnectivityListener = (isOffline: boolean) => void;

type NetInfoStateLike = {
  isConnected: boolean | null;
};

type NetInfoModuleLike = {
  addEventListener(listener: (state: NetInfoStateLike) => void): () => void;
};

type EventTargetLike = {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
};

type ConnectivitySource = {
  /**
   * Attach to live connectivity state. The source must report the
   * current state (synchronously or asynchronously) and then report
   * each change. Returns the function that detaches the source.
   */
  subscribe(onState: (isOffline: boolean) => void): () => void;
};

let initialized = false;
let currentOffline: boolean | null = null;
let sourceUnsubscribe: (() => void) | null = null;
let netInfoModuleOverride: NetInfoModuleLike | null = null;
const listeners = new Set<ConnectivityListener>();

function applyState(isOffline: boolean): void {
  currentOffline = isOffline;
  listeners.forEach((listener) => {
    try {
      listener(isOffline);
    } catch {
      void 0;
    }
  });
}

function ensureInitialized(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  const source = resolveSource();
  if (source === null) {
    // No usable source in this environment: state stays unknown,
    // which is (by contract) not offline.
    return;
  }
  try {
    sourceUnsubscribe = source.subscribe(applyState);
  } catch {
    // The source failed to attach (e.g. netinfo loaded but cannot
    // subscribe in this environment); fall back to the navigator
    // source when one is available.
    sourceUnsubscribe = null;
    const fallback = createNavigatorSource();
    if (fallback !== null) {
      sourceUnsubscribe = fallback.subscribe(applyState);
    }
  }
}

function resolveSource(): ConnectivitySource | null {
  if (netInfoModuleOverride !== null) {
    return createNetInfoSource(netInfoModuleOverride);
  }
  const netInfo = loadNetInfoModule();
  if (netInfo !== null) {
    return createNetInfoSource(netInfo);
  }
  return createNavigatorSource();
}

function loadNetInfoModule(): NetInfoModuleLike | null {
  let mod: unknown;
  try {
    mod = require('@react-native-community/netinfo');
  } catch {
    return null;
  }
  const candidate =
    (mod as { default?: unknown } | null | undefined)?.default ?? mod;
  const netInfo = candidate as NetInfoModuleLike | null | undefined;
  if (
    netInfo !== null &&
    netInfo !== undefined &&
    typeof netInfo.addEventListener === 'function'
  ) {
    return netInfo;
  }
  return null;
}

function createNetInfoSource(netInfo: NetInfoModuleLike): ConnectivitySource {
  return {
    subscribe(onState) {
      const unsubscribe = netInfo.addEventListener((state) => {
        // Only a definitively disconnected state counts as offline;
        // `null` (unknown) and everything else stays "not offline".
        onState(state.isConnected === false);
      });
      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    },
  };
}

function createNavigatorSource(): ConnectivitySource | null {
  const scope = globalThis as { navigator?: unknown };
  if (scope.navigator === undefined) {
    return null;
  }
  return {
    subscribe(onState) {
      // Only `onLine === false` is definitively offline.
      onState(readNavigatorOnLine() === false);
      const target = resolveEventTarget();
      if (target === null) {
        return () => {};
      }
      const handleOnline = () => onState(false);
      const handleOffline = () => onState(true);
      target.addEventListener('online', handleOnline);
      target.addEventListener('offline', handleOffline);
      return () => {
        target.removeEventListener('online', handleOnline);
        target.removeEventListener('offline', handleOffline);
      };
    },
  };
}

function readNavigatorOnLine(): boolean | undefined {
  const scope = globalThis as { navigator?: { onLine?: unknown } };
  const onLine = scope.navigator?.onLine;
  return typeof onLine === 'boolean' ? onLine : undefined;
}

function resolveEventTarget(): EventTargetLike | null {
  const scope = globalThis as {
    addEventListener?: (type: string, handler: () => void) => void;
    removeEventListener?: (type: string, handler: () => void) => void;
  };
  if (
    typeof scope.addEventListener !== 'function' ||
    typeof scope.removeEventListener !== 'function'
  ) {
    return null;
  }
  return {
    addEventListener: scope.addEventListener,
    removeEventListener: scope.removeEventListener,
  };
}

/**
 * Returns true only when the live connectivity source has reported a
 * definitively offline state. An unknown state is not offline.
 */
export function isConnectivityOffline(): boolean {
  ensureInitialized();
  return currentOffline === true;
}

/**
 * Subscribe to live connectivity changes. The known state is replayed
 * synchronously when already known, with no replay while unknown,
 * and then each live state change is reported. Returns the function
 * that unsubscribes the listener.
 */
export function subscribeConnectivity(
  listener: ConnectivityListener
): () => void {
  ensureInitialized();
  listeners.add(listener);
  if (currentOffline !== null) {
    try {
      listener(currentOffline);
    } catch {
      void 0;
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Test-only controls for the connectivity singleton. Not used in
 * production. `reset()` returns the singleton to its pristine state;
 * `useNetInfoModule()` lets tests drive the netinfo source path (state
 * mapping included) with a simulated module instead of a physical
 * device. Call `useNetInfoModule()` after `reset()` and before any
 * state read.
 */
export const __connectivityTestControls = {
  reset(): void {
    if (sourceUnsubscribe !== null) {
      const unsubscribe = sourceUnsubscribe;
      sourceUnsubscribe = null;
      unsubscribe();
    }
    initialized = false;
    currentOffline = null;
    netInfoModuleOverride = null;
    listeners.clear();
  },

  useNetInfoModule(netInfo: NetInfoModuleLike): void {
    netInfoModuleOverride = netInfo;
  },
};
