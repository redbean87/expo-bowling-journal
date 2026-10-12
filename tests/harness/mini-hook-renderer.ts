// Shared mini hook renderer for the three offline test suites
// (`tests/providers/game-save-queue-syncer.test.ts`,
// `tests/hooks/journal-hooks-offline.test.ts`, and
// `tests/hooks/import-backup-offline.test.ts`), extracted from the
// syncer suite's private copy.
//
// Implements the subset of React hooks the tested components use, with
// the same hook-order, memo, and effect cleanup/dependency semantics
// the components rely on. State updates schedule a re-render pass on
// the microtask queue, mirroring React's batched passive-effect
// updates.
//
// The only suite-specific seam is the active-renderer setter: each
// suite's stub file owns its own `__activeRenderer` registry (and its
// own `RendererHandle` structural type), so the suite passes its stub's
// `__setActiveRenderer` to the constructor. `useRef` and `useEffect`
// are no-ops for components that never call them, so this superset
// serves all three suites unchanged.

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

export class MiniReact {
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
  private readonly setActiveRenderer: (renderer: MiniReact | null) => void;

  constructor(
    componentFn: () => null,
    setActiveRenderer: (renderer: MiniReact | null) => void
  ) {
    this.componentFn = componentFn;
    this.setActiveRenderer = setActiveRenderer;
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
    this.setActiveRenderer(this);

    try {
      this.hookIndex = 0;
      this.effectSlot = 0;
      this.componentFn();
      this.runEffects();
    } finally {
      this.setActiveRenderer(null);
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
