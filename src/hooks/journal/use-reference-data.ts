import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useMemo } from 'react';

import { convexJournalService } from '@/services/journal';
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

export function useReferenceData(options?: {
  enabled?: boolean;
  includeRecent?: boolean;
}) {
  const enabled = options?.enabled ?? true;
  const includeRecent = options?.includeRecent ?? true;
  const { isAuthenticated } = useConvexAuth();
  const shouldQuery = isAuthenticated && enabled;
  const balls = useQuery(
    convexJournalService.listBalls,
    shouldQuery ? {} : 'skip'
  );
  const recentBalls = useQuery(
    convexJournalService.listRecentBalls,
    shouldQuery && includeRecent ? {} : 'skip'
  );
  const patterns = useQuery(
    convexJournalService.listPatterns,
    shouldQuery ? {} : 'skip'
  );
  const recentPatterns = useQuery(
    convexJournalService.listRecentPatterns,
    shouldQuery && includeRecent ? {} : 'skip'
  );
  const houses = useQuery(
    convexJournalService.listHouses,
    shouldQuery ? {} : 'skip'
  );
  const recentHouses = useQuery(
    convexJournalService.listRecentHouses,
    shouldQuery && includeRecent ? {} : 'skip'
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
      return buildRankedReferenceSuggestions(options, recent, query, 10);
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
