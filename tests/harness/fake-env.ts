// Shared fake timers and fake NetInfo for the three offline test suites
// (`tests/providers/game-save-queue-syncer.test.ts`,
// `tests/hooks/journal-hooks-offline.test.ts`, and
// `tests/hooks/import-backup-offline.test.ts`), extracted from the
// syncer suite's private copy.
//
// The fake timers are currently used only by the syncer suite (the
// other two suites have no timer machinery); the fake NetInfo source
// is used by all three.

// --- Faked timers ---------------------------------------------------------
//
// Captures the suite's `setTimeout`/`setInterval` calls so cadence
// (5000ms) and teardown (offline / no pending entries) can be asserted
// without waiting on real time. Timers only fire when the test fires
// them.

type TimerEntry = {
  id: number;
  type: 'timeout' | 'interval';
  delay: number;
  fn: () => void;
};

export class FakeTimers {
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

export type FakeNetInfoState = {
  isConnected: boolean | null;
  type: string;
};

type FakeNetInfoModule = {
  addEventListener(listener: (state: FakeNetInfoState) => void): () => void;
};

export type FakeNetInfo = {
  mod: FakeNetInfoModule;
  emit(state: FakeNetInfoState): void;
};

// Mirrors the netinfo fake in `tests/connectivity.test.ts`: the initial
// state is delivered right after the source is subscribed (synchronously
// when `sync` is true, which exercises the singleton's known-state
// replay; as a microtask otherwise).
export function createFakeNetInfo(
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
