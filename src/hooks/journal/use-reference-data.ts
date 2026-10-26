import { useConvexAuth } from 'convex/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  loadJournalClientSyncMap,
  type JournalClientSyncMap,
} from '@/screens/journal/journal-client-sync-map-storage';
import { type QueuedReferenceCreateEntry } from '@/screens/journal/reference-create-queue';
import { loadReferenceCreateQueue } from '@/screens/journal/reference-create-queue-storage';
import {
  buildDraftReferenceId,
  type ReferenceType,
} from '@/screens/journal/reference-draft-id';
import {
  createBall as localCreateBall,
  createHouse as localCreateHouse,
  createPattern as localCreatePattern,
} from '@/services/journal/local-writes';
import {
  getLocalJournalService,
  type Ball as LocalBall,
  type House as LocalHouse,
  type Pattern as LocalPattern,
} from '@/services/local-journal';
import { buildRankedReferenceSuggestions } from '@/utils/reference-combobox-utils';

export type ReferenceOption<TId extends string> = {
  id: TId;
  label: string;
  secondaryLabel?: string | null;
};

function toNameSortedOptions<TId extends string>(
  values: Array<{ _id: TId; name: string; brand?: string | null }>
): ReferenceOption<TId>[] {
  return [...values]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((value) => ({
      id: value._id,
      label: value.name,
      secondaryLabel:
        typeof value.brand === 'string' && value.brand.trim().length > 0
          ? value.brand.trim()
          : null,
    }));
}

function findNameById<TId extends string>(
  options: ReferenceOption<TId>[],
  id: TId | null
) {
  if (!id) {
    return null;
  }

  return options.find((option) => option.id === id)?.label ?? null;
}

function getReferenceMapByType(
  syncMap: JournalClientSyncMap,
  referenceType: ReferenceType
) {
  if (referenceType === 'house') {
    return syncMap.houses;
  }

  if (referenceType === 'pattern') {
    return syncMap.patterns;
  }

  return syncMap.balls;
}

function toQueuedReferenceOptions(
  entries: QueuedReferenceCreateEntry[],
  referenceType: ReferenceType,
  syncMap: JournalClientSyncMap
) {
  const resolvedReferenceMap = getReferenceMapByType(syncMap, referenceType);
  const latestByClientSyncId = new Map<string, QueuedReferenceCreateEntry>();

  for (const entry of entries) {
    if (entry.referenceType !== referenceType) {
      continue;
    }

    if (resolvedReferenceMap[entry.clientSyncId]) {
      continue;
    }

    const existing = latestByClientSyncId.get(entry.clientSyncId);

    if (!existing || entry.updatedAt >= existing.updatedAt) {
      latestByClientSyncId.set(entry.clientSyncId, entry);
    }
  }

  return [...latestByClientSyncId.values()]
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((entry) => ({
      id: buildDraftReferenceId(referenceType, entry.clientSyncId),
      label: entry.name,
      secondaryLabel: 'Queued offline',
    }));
}

function mergeReferenceOptions<TId extends string>(
  baseOptions: ReferenceOption<TId>[],
  draftOptions: ReferenceOption<string>[]
) {
  const seenIds = new Set<string>();

  const merged = [...draftOptions, ...baseOptions].filter((option) => {
    if (seenIds.has(option.id)) {
      return false;
    }

    seenIds.add(option.id);
    return true;
  });

  return merged;
}

export function useReferenceData(options?: {
  enabled?: boolean;
  includeRecent?: boolean;
}) {
  const enabled = options?.enabled ?? true;
  const includeRecent = options?.includeRecent ?? true;
  const { isAuthenticated } = useConvexAuth();
  const [queuedReferenceCreates, setQueuedReferenceCreates] = useState<
    QueuedReferenceCreateEntry[]
  >([]);
  const [syncMap, setSyncMap] = useState<JournalClientSyncMap>({
    leagues: {},
    sessions: {},
    houses: {},
    patterns: {},
    balls: {},
  });
  const [ballList, setBallList] = useState<LocalBall[] | null>(null);
  const [recentBallList, setRecentBallList] = useState<LocalBall[] | null>(
    null
  );
  const [patternList, setPatternList] = useState<LocalPattern[] | null>(null);
  const [recentPatternList, setRecentPatternList] = useState<
    LocalPattern[] | null
  >(null);
  const [houseList, setHouseList] = useState<LocalHouse[] | null>(null);
  const [recentHouseList, setRecentHouseList] = useState<LocalHouse[] | null>(
    null
  );

  // Local SQLite is the authoritative reference read: no Convex query, no
  // cloud cache, no auth gate. The skip conditions (enabled/includeRecent)
  // are enforced on the derived option lists below, matching the original
  // skipped-query behavior (options fall back to empty).
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    const loadBalls = async () => {
      try {
        const balls = await getLocalJournalService().listBalls();

        if (isMounted) {
          setBallList(balls);
        }
      } catch {
        if (isMounted) {
          setBallList([]);
        }
      }
    };

    void loadBalls();

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !includeRecent) {
      return;
    }

    let isMounted = true;

    const loadRecentBalls = async () => {
      try {
        const balls = await getLocalJournalService().listRecentBalls();

        if (isMounted) {
          setRecentBallList(balls);
        }
      } catch {
        if (isMounted) {
          setRecentBallList([]);
        }
      }
    };

    void loadRecentBalls();

    return () => {
      isMounted = false;
    };
  }, [enabled, includeRecent]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    const loadPatterns = async () => {
      try {
        const patterns = await getLocalJournalService().listPatterns();

        if (isMounted) {
          setPatternList(patterns);
        }
      } catch {
        if (isMounted) {
          setPatternList([]);
        }
      }
    };

    void loadPatterns();

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !includeRecent) {
      return;
    }

    let isMounted = true;

    const loadRecentPatterns = async () => {
      try {
        const patterns = await getLocalJournalService().listRecentPatterns();

        if (isMounted) {
          setRecentPatternList(patterns);
        }
      } catch {
        if (isMounted) {
          setRecentPatternList([]);
        }
      }
    };

    void loadRecentPatterns();

    return () => {
      isMounted = false;
    };
  }, [enabled, includeRecent]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    const loadHouses = async () => {
      try {
        const houses = await getLocalJournalService().listHouses();

        if (isMounted) {
          setHouseList(houses);
        }
      } catch {
        if (isMounted) {
          setHouseList([]);
        }
      }
    };

    void loadHouses();

    return () => {
      isMounted = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !includeRecent) {
      return;
    }

    let isMounted = true;

    const loadRecentHouses = async () => {
      try {
        const houses = await getLocalJournalService().listRecentHouses();

        if (isMounted) {
          setRecentHouseList(houses);
        }
      } catch {
        if (isMounted) {
          setRecentHouseList([]);
        }
      }
    };

    void loadRecentHouses();

    return () => {
      isMounted = false;
    };
  }, [enabled, includeRecent]);

  // Local-first reference-data writes (C-2): ball, pattern, and house
  // creation goes straight to the SQLite-backed local journal through the
  // app-boundary write adapter (`src/services/journal/local-writes.ts`), the
  // write-side counterpart of the `local-reads.ts` adapters this hook already
  // uses for its six reference reads. There is no Convex mutation, no
  // connectivity branch, no offline-queue enqueue, and no retryable-error
  // re-queue fallback: local mode is the only mode, per
  // docs/local-first-architecture.md §1 and §3 (UI → local service →
  // SQLite), so a reference create persists whether or not the device has
  // a network and whether or not anyone has signed in. The legacy
  // reference-create queue is an implementation artifact that stays
  // cloud-only (§2.7): nothing here writes that queue storage, so entries
  // already persisted in it stay untouched and still render below as
  // `Queued offline` draft options.
  //
  // Create returns the persisted local UUID (no `draft-<clientSyncId>`
  // identifier is produced for a new entity), so the screens that consume
  // these ids keep routing on a real local id. Service validation and error
  // propagation belong to the local service and are passed through unchanged.
  const refreshQueuedReferenceCreates = useCallback(async () => {
    const [entries, nextSyncMap] = await Promise.all([
      loadReferenceCreateQueue(),
      loadJournalClientSyncMap(),
    ]);

    setQueuedReferenceCreates(entries);
    setSyncMap(nextSyncMap);
  }, []);

  const serverBallOptions = useMemo(
    () =>
      toNameSortedOptions(
        (enabled ? (ballList ?? []) : []).map((ball) => ({
          _id: ball.id,
          name: ball.name,
          brand: ball.brand,
        }))
      ),
    [ballList, enabled]
  );
  const serverPatternOptions = useMemo(
    () =>
      toNameSortedOptions(
        (enabled ? (patternList ?? []) : []).map((pattern) => ({
          _id: pattern.id,
          name: pattern.name,
        }))
      ),
    [enabled, patternList]
  );
  const serverHouseOptions = useMemo(
    () =>
      toNameSortedOptions(
        (enabled ? (houseList ?? []) : []).map((house) => ({
          _id: house.id,
          name: house.name,
        }))
      ),
    [enabled, houseList]
  );

  const draftBallOptions = useMemo(
    () => toQueuedReferenceOptions(queuedReferenceCreates, 'ball', syncMap),
    [queuedReferenceCreates, syncMap]
  );
  const draftPatternOptions = useMemo(
    () => toQueuedReferenceOptions(queuedReferenceCreates, 'pattern', syncMap),
    [queuedReferenceCreates, syncMap]
  );
  const draftHouseOptions = useMemo(
    () => toQueuedReferenceOptions(queuedReferenceCreates, 'house', syncMap),
    [queuedReferenceCreates, syncMap]
  );

  const ballOptions = useMemo(
    () => mergeReferenceOptions(serverBallOptions, draftBallOptions),
    [draftBallOptions, serverBallOptions]
  );
  const patternOptions = useMemo(
    () => mergeReferenceOptions(serverPatternOptions, draftPatternOptions),
    [draftPatternOptions, serverPatternOptions]
  );
  const houseOptions = useMemo(
    () => mergeReferenceOptions(serverHouseOptions, draftHouseOptions),
    [draftHouseOptions, serverHouseOptions]
  );

  const recentBallOptions = useMemo(
    () =>
      toNameSortedOptions(
        (includeRecent ? (recentBallList ?? []) : []).map((ball) => ({
          _id: ball.id,
          name: ball.name,
          brand: ball.brand,
        }))
      ),
    [includeRecent, recentBallList]
  );
  const recentPatternOptions = useMemo(
    () =>
      toNameSortedOptions(
        (includeRecent ? (recentPatternList ?? []) : []).map((pattern) => ({
          _id: pattern.id,
          name: pattern.name,
        }))
      ),
    [includeRecent, recentPatternList]
  );
  const recentHouseOptions = useMemo(
    () =>
      toNameSortedOptions(
        (includeRecent ? (recentHouseList ?? []) : []).map((house) => ({
          _id: house.id,
          name: house.name,
        }))
      ),
    [includeRecent, recentHouseList]
  );

  const createBall = useCallback(
    async (name: string) => {
      const trimmedName = name.trim();

      if (trimmedName.length === 0) {
        throw new Error('Ball name is required');
      }

      const createdId = await localCreateBall({ name: trimmedName });
      const id = String(createdId);

      return {
        id,
        label: findNameById(ballOptions, id) ?? trimmedName,
      };
    },
    [ballOptions]
  );

  const createPattern = useCallback(
    async (name: string) => {
      const trimmedName = name.trim();

      if (trimmedName.length === 0) {
        throw new Error('Pattern name is required');
      }

      const createdId = await localCreatePattern({ name: trimmedName });
      const id = String(createdId);

      return {
        id,
        label: findNameById(patternOptions, id) ?? trimmedName,
      };
    },
    [patternOptions]
  );

  const createHouse = useCallback(
    async (name: string) => {
      const trimmedName = name.trim();

      if (trimmedName.length === 0) {
        throw new Error('House name is required');
      }

      const createdId = await localCreateHouse({ name: trimmedName });
      const id = String(createdId);

      return {
        id,
        label: findNameById(houseOptions, id) ?? trimmedName,
      };
    },
    [houseOptions]
  );

  const buildSuggestions = useCallback(
    (
      options: ReferenceOption<string>[],
      recent: ReferenceOption<string>[],
      query: string
    ) => {
      return buildRankedReferenceSuggestions(options, recent, query, 10);
    },
    []
  );

  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      return;
    }

    const initialRefresh = setTimeout(() => {
      void refreshQueuedReferenceCreates();
    }, 0);

    const interval = setInterval(() => {
      void refreshQueuedReferenceCreates();
    }, 2000);

    return () => {
      clearTimeout(initialRefresh);
      clearInterval(interval);
    };
  }, [enabled, isAuthenticated, refreshQueuedReferenceCreates]);

  return {
    ballOptions,
    patternOptions,
    houseOptions,
    recentBallOptions,
    recentPatternOptions,
    recentHouseOptions,
    buildSuggestions,
    createBall,
    createPattern,
    createHouse,
  };
}
