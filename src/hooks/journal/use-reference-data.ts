import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useMemo } from 'react';

import { convexJournalService } from '@/services/journal';

type ReferenceOption<TId extends string> = {
  id: TId;
  label: string;
  secondaryLabel?: string | null;
};

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

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

export function useReferenceData() {
  const { isAuthenticated } = useConvexAuth();
  const balls = useQuery(
    convexJournalService.listBalls,
    isAuthenticated ? {} : 'skip'
  );
  const recentBalls = useQuery(
    convexJournalService.listRecentBalls,
    isAuthenticated ? {} : 'skip'
  );
  const patterns = useQuery(
    convexJournalService.listPatterns,
    isAuthenticated ? {} : 'skip'
  );
  const recentPatterns = useQuery(
    convexJournalService.listRecentPatterns,
    isAuthenticated ? {} : 'skip'
  );
  const houses = useQuery(
    convexJournalService.listHouses,
    isAuthenticated ? {} : 'skip'
  );
  const recentHouses = useQuery(
    convexJournalService.listRecentHouses,
    isAuthenticated ? {} : 'skip'
  );

  const createBallMutation = useMutation(convexJournalService.createBall);
  const createPatternMutation = useMutation(convexJournalService.createPattern);
  const createHouseMutation = useMutation(convexJournalService.createHouse);

  const ballOptions = useMemo(
    () =>
      toNameSortedOptions(
        (balls ?? []).map((ball) => ({ ...ball, _id: String(ball._id) }))
      ),
    [balls]
  );
  const patternOptions = useMemo(
    () =>
      toNameSortedOptions(
        (patterns ?? []).map((pattern) => ({
          ...pattern,
          _id: String(pattern._id),
        }))
      ),
    [patterns]
  );
  const houseOptions = useMemo(
    () =>
      toNameSortedOptions(
        (houses ?? []).map((house) => ({ ...house, _id: String(house._id) }))
      ),
    [houses]
  );

  const recentBallOptions = useMemo(
    () =>
      toNameSortedOptions(
        (recentBalls ?? []).map((ball) => ({ ...ball, _id: String(ball._id) }))
      ),
    [recentBalls]
  );
  const recentPatternOptions = useMemo(
    () =>
      toNameSortedOptions(
        (recentPatterns ?? []).map((pattern) => ({
          ...pattern,
          _id: String(pattern._id),
        }))
      ),
    [recentPatterns]
  );
  const recentHouseOptions = useMemo(
    () =>
      toNameSortedOptions(
        (recentHouses ?? []).map((house) => ({
          ...house,
          _id: String(house._id),
        }))
      ),
    [recentHouses]
  );

  const createBall = useCallback(
    async (name: string) => {
      const createdId = await createBallMutation({ name: name.trim() });
      const id = String(createdId) as string;
      return {
        id,
        label: findNameById(ballOptions, id) ?? name.trim(),
      };
    },
    [ballOptions, createBallMutation]
  );

  const createPattern = useCallback(
    async (name: string) => {
      const createdId = await createPatternMutation({ name: name.trim() });
      const id = String(createdId) as string;
      return {
        id,
        label: findNameById(patternOptions, id) ?? name.trim(),
      };
    },
    [createPatternMutation, patternOptions]
  );

  const createHouse = useCallback(
    async (name: string) => {
      const createdId = await createHouseMutation({ name: name.trim() });
      const id = String(createdId) as string;
      return {
        id,
        label: findNameById(houseOptions, id) ?? name.trim(),
      };
    },
    [createHouseMutation, houseOptions]
  );

  const buildSuggestions = useCallback(
    (
      options: ReferenceOption<string>[],
      recent: ReferenceOption<string>[],
      query: string
    ) => {
      const normalized = normalizeQuery(query);

      if (normalized.length === 0) {
        return recent.slice(0, 10);
      }

      return options
        .filter((option) => normalizeQuery(option.label).includes(normalized))
        .slice(0, 10);
    },
    []
  );

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

export type { ReferenceOption };
