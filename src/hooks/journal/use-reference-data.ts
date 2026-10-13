import { useConvexAuth, useMutation } from 'convex/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  loadJournalClientSyncMap,
  type JournalClientSyncMap,
} from '@/screens/journal/journal-client-sync-map-storage';
import {
  isNavigatorOffline,
  withTimeout,
} from '@/screens/journal/journal-offline-create';
import {
  createQueuedReferenceCreateEntry,
  isRetryableReferenceCreateError,
  upsertQueuedReferenceCreateEntry,
  type QueuedReferenceCreateEntry,
} from '@/screens/journal/reference-create-queue';
import {
  loadReferenceCreateQueue,
  persistReferenceCreateQueue,
} from '@/screens/journal/reference-create-queue-storage';
import {
  buildDraftReferenceId,
  type ReferenceType,
} from '@/screens/journal/reference-draft-id';
import { convexJournalService } from '@/services/journal';
import {
  getLocalJournalService,
  type Ball as LocalBall,
  type House as LocalHouse,
  type Pattern as LocalPattern,
} from '@/services/local-journal';
import { createClientSyncId } from '@/utils/client-sync-id';
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

  const createBallMutation = useMutation(convexJournalService.createBall);
  const createPatternMutation = useMutation(convexJournalService.createPattern);
  const createHouseMutation = useMutation(convexJournalService.createHouse);

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

  const queueReferenceCreate = useCallback(
    async (referenceType: ReferenceType, trimmedName: string) => {
      const clientSyncId = createClientSyncId(referenceType);
      const queuedEntry = createQueuedReferenceCreateEntry({
        referenceType,
        clientSyncId,
        name: trimmedName,
        now: Date.now(),
      });
      const nextQueue = upsertQueuedReferenceCreateEntry(
        await loadReferenceCreateQueue(),
        queuedEntry
      );
      await persistReferenceCreateQueue(nextQueue);
      await refreshQueuedReferenceCreates();

      return {
        id: buildDraftReferenceId(referenceType, clientSyncId),
        label: trimmedName,
      };
    },
    [refreshQueuedReferenceCreates]
  );

  const createBall = useCallback(
    async (name: string) => {
      const trimmedName = name.trim();

      if (trimmedName.length === 0) {
        throw new Error('Ball name is required');
      }

      if (isNavigatorOffline()) {
        return queueReferenceCreate('ball', trimmedName);
      }

      try {
        const createdId = await withTimeout(
          createBallMutation({ name: trimmedName }),
          4500
        );
        void refreshQueuedReferenceCreates();
        const id = String(createdId) as string;
        return {
          id,
          label: findNameById(ballOptions, id) ?? trimmedName,
        };
      } catch (caught) {
        if (isRetryableReferenceCreateError(caught)) {
          return queueReferenceCreate('ball', trimmedName);
        }

        throw caught;
      }
    },
    [
      ballOptions,
      createBallMutation,
      queueReferenceCreate,
      refreshQueuedReferenceCreates,
    ]
  );

  const createPattern = useCallback(
    async (name: string) => {
      const trimmedName = name.trim();

      if (trimmedName.length === 0) {
        throw new Error('Pattern name is required');
      }

      if (isNavigatorOffline()) {
        return queueReferenceCreate('pattern', trimmedName);
      }

      try {
        const createdId = await withTimeout(
          createPatternMutation({ name: trimmedName }),
          4500
        );
        void refreshQueuedReferenceCreates();
        const id = String(createdId) as string;
        return {
          id,
          label: findNameById(patternOptions, id) ?? trimmedName,
        };
      } catch (caught) {
        if (isRetryableReferenceCreateError(caught)) {
          return queueReferenceCreate('pattern', trimmedName);
        }

        throw caught;
      }
    },
    [
      createPatternMutation,
      patternOptions,
      queueReferenceCreate,
      refreshQueuedReferenceCreates,
    ]
  );

  const createHouse = useCallback(
    async (name: string) => {
      const trimmedName = name.trim();

      if (trimmedName.length === 0) {
        throw new Error('House name is required');
      }

      if (isNavigatorOffline()) {
        return queueReferenceCreate('house', trimmedName);
      }

      try {
        const createdId = await withTimeout(
          createHouseMutation({ name: trimmedName }),
          4500
        );
        void refreshQueuedReferenceCreates();
        const id = String(createdId) as string;
        return {
          id,
          label: findNameById(houseOptions, id) ?? trimmedName,
        };
      } catch (caught) {
        if (isRetryableReferenceCreateError(caught)) {
          return queueReferenceCreate('house', trimmedName);
        }

        throw caught;
      }
    },
    [
      createHouseMutation,
      houseOptions,
      queueReferenceCreate,
      refreshQueuedReferenceCreates,
    ]
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
