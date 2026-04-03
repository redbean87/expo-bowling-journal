import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import { resolveReferenceIdForMutation } from './reference-id-resolution';

import {
  convexJournalService,
  type CreateLeagueInput,
  type RemoveLeagueInput,
  type UpdateLeagueInput,
} from '@/services/journal';

export function useLeagues() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const leagues = useQuery(
    convexJournalService.listLeagues,
    isAuthenticated ? {} : 'skip'
  );
  const createLeagueMutation = useMutation(convexJournalService.createLeague);
  const updateLeagueMutation = useMutation(convexJournalService.updateLeague);
  const removeLeagueMutation = useMutation(convexJournalService.removeLeague);
  const [isCreating, setIsCreating] = useState(false);

  const createLeague = useCallback(
    async (input: CreateLeagueInput) => {
      setIsCreating(true);

      try {
        const resolvedHouseId = await resolveReferenceIdForMutation(
          'house',
          input.houseId ? String(input.houseId) : null
        );

        const { leagueType, ...rest } = input;

        return await createLeagueMutation({
          ...rest,
          houseId: (resolvedHouseId as never) ?? null,
          ...(leagueType !== undefined ? { type: leagueType } : {}),
        });
      } finally {
        setIsCreating(false);
      }
    },
    [createLeagueMutation]
  );

  const createOpenBowlingLeague = useCallback(async () => {
    setIsCreating(true);

    try {
      return await createLeagueMutation({
        name: 'Open Bowling',
        type: 'open',
      });
    } finally {
      setIsCreating(false);
    }
  }, [createLeagueMutation]);

  const updateLeague = useCallback(
    async (input: UpdateLeagueInput) => {
      const resolvedHouseId = await resolveReferenceIdForMutation(
        'house',
        input.houseId ? String(input.houseId) : null
      );

      const { leagueType, ...rest } = input;

      return await updateLeagueMutation({
        ...rest,
        houseId: (resolvedHouseId as never) ?? null,
        ...(leagueType !== undefined ? { type: leagueType } : {}),
      });
    },
    [updateLeagueMutation]
  );

  const removeLeague = useCallback(
    async (input: RemoveLeagueInput) => {
      return await removeLeagueMutation(input);
    },
    [removeLeagueMutation]
  );

  return {
    leagues: leagues ?? [],
    isLoading: isAuthLoading || (isAuthenticated && leagues === undefined),
    isAuthenticated,
    createLeague,
    createOpenBowlingLeague,
    updateLeague,
    removeLeague,
    isCreating,
  };
}
