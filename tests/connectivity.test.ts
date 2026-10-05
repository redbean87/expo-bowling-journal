import assert from 'node:assert/strict';
import test from 'node:test';

import { isNavigatorOffline } from '../src/screens/journal/journal-offline-create';
import {
  __connectivityTestControls,
  isConnectivityOffline,
  subscribeConnectivity,
} from '../src/services/connectivity';

type FakeNetInfoState = {
  isConnected: boolean | null;
  type: string;
};

type FakeNetInfoModule = {
  addEventListener(listener: (state: FakeNetInfoState) => void): () => void;
};

function createFakeNetInfo(initial: FakeNetInfoState) {
  let listener: ((state: FakeNetInfoState) => void) | null = null;
  let latest: FakeNetInfoState = initial;
  let subscribeCount = 0;
  const mod: FakeNetInfoModule = {
    addEventListener(nextListener: (state: FakeNetInfoState) => void) {
      subscribeCount += 1;
      listener = nextListener;
      const state = latest;
      queueMicrotask(() => {
        nextListener(state);
      });
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
    subscribeCount(): number {
      return subscribeCount;
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator'
);

function setNavigatorOnLine(onLine: boolean | undefined): void {
  const scope = globalThis as { navigator?: unknown };
  if (onLine === undefined) {
    delete scope.navigator;
  } else {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine },
      configurable: true,
      writable: true,
    });
  }
}

function restoreNavigator(): void {
  if (originalNavigatorDescriptor !== undefined) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
}

type GlobalEventTarget = {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
};

function installGlobalEventTarget(): GlobalEventTarget & {
  dispatch(type: string): void;
} {
  const handlers = new Map<string, Set<() => void>>();
  const target: GlobalEventTarget & { dispatch(type: string): void } = {
    addEventListener(type: string, handler: () => void) {
      let set = handlers.get(type);
      if (set === undefined) {
        set = new Set<() => void>();
        handlers.set(type, set);
      }
      set.add(handler);
    },
    removeEventListener(type: string, handler: () => void) {
      handlers.get(type)?.delete(handler);
    },
    dispatch(type: string): void {
      const set = handlers.get(type);
      if (set === undefined) {
        return;
      }
      for (const handler of [...set]) {
        handler();
      }
    },
  };
  const scope = globalThis as {
    addEventListener?: unknown;
    removeEventListener?: unknown;
  };
  scope.addEventListener = target.addEventListener;
  scope.removeEventListener = target.removeEventListener;
  return target;
}

function uninstallGlobalEventTarget(): void {
  const scope = globalThis as {
    addEventListener?: unknown;
    removeEventListener?: unknown;
  };
  delete scope.addEventListener;
  delete scope.removeEventListener;
}

function resetConnectivity(): void {
  __connectivityTestControls.reset();
  uninstallGlobalEventTarget();
  restoreNavigator();
}

test('netinfo source: initial online state is not offline', async () => {
  resetConnectivity();
  const fake = createFakeNetInfo({ isConnected: true, type: 'wifi' });
  __connectivityTestControls.useNetInfoModule(fake.mod);

  assert.equal(isConnectivityOffline(), false);
  await flushMicrotasks();
  assert.equal(isConnectivityOffline(), false);

  // The live subscription must be connected: a new offline state is
  // picked up without a re-initialization.
  fake.emit({ isConnected: false, type: 'none' });
  assert.equal(isConnectivityOffline(), true);
});

test('netinfo source: initial offline state is offline', async () => {
  resetConnectivity();
  const fake = createFakeNetInfo({ isConnected: false, type: 'none' });
  __connectivityTestControls.useNetInfoModule(fake.mod);

  // The first read initializes the singleton; the current state is
  // delivered asynchronously right after the source is subscribed.
  assert.equal(isConnectivityOffline(), false);
  await flushMicrotasks();
  assert.equal(isConnectivityOffline(), true);
});

test('netinfo source: offline to online transition', async () => {
  resetConnectivity();
  const fake = createFakeNetInfo({ isConnected: false, type: 'none' });
  __connectivityTestControls.useNetInfoModule(fake.mod);

  assert.equal(isConnectivityOffline(), false);
  await flushMicrotasks();
  assert.equal(isConnectivityOffline(), true);

  fake.emit({ isConnected: true, type: 'wifi' });
  assert.equal(isConnectivityOffline(), false);
});

test('netinfo source: online to offline transition', async () => {
  resetConnectivity();
  const fake = createFakeNetInfo({ isConnected: true, type: 'wifi' });
  __connectivityTestControls.useNetInfoModule(fake.mod);

  await flushMicrotasks();
  assert.equal(isConnectivityOffline(), false);

  fake.emit({ isConnected: false, type: 'none' });
  assert.equal(isConnectivityOffline(), true);
});

test('netinfo source: unknown state is not offline', async () => {
  resetConnectivity();
  const fake = createFakeNetInfo({ isConnected: true, type: 'wifi' });
  __connectivityTestControls.useNetInfoModule(fake.mod);

  await flushMicrotasks();
  fake.emit({ isConnected: null, type: 'unknown' });
  assert.equal(isConnectivityOffline(), false);
});

test('netinfo source: subscribers are notified and unsubscription stops them', async () => {
  resetConnectivity();
  const fake = createFakeNetInfo({ isConnected: true, type: 'wifi' });
  __connectivityTestControls.useNetInfoModule(fake.mod);
  await flushMicrotasks();

  const calls: boolean[] = [];
  const unsubscribe = subscribeConnectivity((isOffline) => {
    calls.push(isOffline);
  });

  // The source re-reports the current state shortly after subscribing.
  await flushMicrotasks();
  assert.deepEqual(calls, [false]);

  fake.emit({ isConnected: false, type: 'none' });
  assert.deepEqual(calls, [false, true]);

  fake.emit({ isConnected: true, type: 'wifi' });
  assert.deepEqual(calls, [false, true, false]);

  unsubscribe();
  fake.emit({ isConnected: false, type: 'none' });
  assert.deepEqual(calls, [false, true, false]);

  // Subscribing again after unsubscription still works.
  const resubscribeCalls: string[] = [];
  const resubscribe = subscribeConnectivity((isOffline) => {
    resubscribeCalls.push(`re:${String(isOffline)}`);
  });
  fake.emit({ isConnected: false, type: 'none' });
  assert.deepEqual(resubscribeCalls, ['re:true']);
  resubscribe();
});

test('singleton: the connectivity source is subscribed exactly once', async () => {
  resetConnectivity();
  const fake = createFakeNetInfo({ isConnected: true, type: 'wifi' });
  __connectivityTestControls.useNetInfoModule(fake.mod);

  assert.equal(isConnectivityOffline(), false);
  assert.equal(isConnectivityOffline(), false);
  const unsubscribeA = subscribeConnectivity(() => {});
  const unsubscribeB = subscribeConnectivity(() => {});
  unsubscribeA();
  unsubscribeB();

  assert.equal(fake.subscribeCount(), 1);
  await flushMicrotasks();
});

test('fallback source: initial online state when navigator.onLine is true', () => {
  resetConnectivity();
  installGlobalEventTarget();
  setNavigatorOnLine(true);

  assert.equal(isConnectivityOffline(), false);
});

test('fallback source: initial offline state when navigator.onLine is false', () => {
  resetConnectivity();
  installGlobalEventTarget();
  setNavigatorOnLine(false);

  assert.equal(isConnectivityOffline(), true);
});

test('fallback source: offline to online transition via global online event', async () => {
  resetConnectivity();
  const target = installGlobalEventTarget();
  setNavigatorOnLine(false);

  await flushMicrotasks();
  assert.equal(isConnectivityOffline(), true);

  target.dispatch('online');
  assert.equal(isConnectivityOffline(), false);
});

test('fallback source: online to offline transition via global offline event', async () => {
  resetConnectivity();
  const target = installGlobalEventTarget();
  setNavigatorOnLine(true);

  await flushMicrotasks();
  assert.equal(isConnectivityOffline(), false);

  target.dispatch('offline');
  assert.equal(isConnectivityOffline(), true);
});

test('fallback regression: no navigator global means not offline', () => {
  resetConnectivity();
  installGlobalEventTarget();
  setNavigatorOnLine(undefined);

  assert.equal(isConnectivityOffline(), false);
});

test('fallback regression: navigator without onLine means not offline', () => {
  resetConnectivity();
  installGlobalEventTarget();
  setNavigatorOnLine(undefined);
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    configurable: true,
    writable: true,
  });

  assert.equal(isConnectivityOffline(), false);
});

test('wiring: isNavigatorOffline reflects the live connectivity singleton', async () => {
  resetConnectivity();
  const target = installGlobalEventTarget();
  setNavigatorOnLine(false);

  assert.equal(isNavigatorOffline(), true);

  target.dispatch('online');
  assert.equal(isNavigatorOffline(), false);
});

test('wiring: isNavigatorOffline tracks netinfo-driven transitions', async () => {
  resetConnectivity();
  const fake = createFakeNetInfo({ isConnected: true, type: 'wifi' });
  __connectivityTestControls.useNetInfoModule(fake.mod);

  await flushMicrotasks();
  assert.equal(isNavigatorOffline(), false);

  fake.emit({ isConnected: false, type: 'none' });
  assert.equal(isNavigatorOffline(), true);
});
