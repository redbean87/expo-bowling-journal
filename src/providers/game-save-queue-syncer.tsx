import { useMutation } from 'convex/react';
import { useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { removeLocalGameDraft } from '@/screens/game-editor/game-local-draft-storage';
import { flushQueuedGameSavesWithLock } from '@/screens/game-editor/game-save-queue-sync';
import { flushJournalCreateQueueWithLock } from '@/screens/journal/journal-create-queue-sync';
import { flushReferenceCreateQueueWithLock } from '@/screens/journal/reference-create-queue-sync';
import { convexJournalService } from '@/services/journal';

export function GameSaveQueueSyncer() {
  const createGameMutation = useMutation(convexJournalService.createGame);
  const updateGameMutation = useMutation(convexJournalService.updateGame);
  const replaceFramesMutation = useMutation(
    convexJournalService.replaceFramesForGame
  );
  const createLeagueMutation = useMutation(convexJournalService.createLeague);
  const updateLeagueMutation = useMutation(convexJournalService.updateLeague);
  const removeLeagueMutation = useMutation(convexJournalService.removeLeague);
  const createSessionMutation = useMutation(convexJournalService.createSession);
  const updateSessionMutation = useMutation(convexJournalService.updateSession);
  const removeSessionMutation = useMutation(convexJournalService.removeSession);
  const createBallMutation = useMutation(convexJournalService.createBall);
  const createPatternMutation = useMutation(convexJournalService.createPattern);
  const createHouseMutation = useMutation(convexJournalService.createHouse);

  const flushQueue = useCallback(async () => {
    if (
      typeof globalThis.navigator !== 'undefined' &&
      globalThis.navigator.onLine === false
    ) {
      return;
    }

    await flushReferenceCreateQueueWithLock({
      createHouse: createHouseMutation,
      createPattern: createPatternMutation,
      createBall: createBallMutation,
    });

    await flushJournalCreateQueueWithLock({
      createLeague: createLeagueMutation,
      updateLeague: updateLeagueMutation,
      removeLeague: removeLeagueMutation,
      createSession: createSessionMutation,
      updateSession: updateSessionMutation,
      removeSession: removeSessionMutation,
    });

    await flushQueuedGameSavesWithLock({
      createGame: createGameMutation,
      updateGame: updateGameMutation,
      replaceFramesForGame: replaceFramesMutation,
      onEntrySynced: ({ entry, originalQueueId }) => {
        void removeLocalGameDraft(originalQueueId);

        if (entry.queueId !== originalQueueId) {
          void removeLocalGameDraft(entry.queueId);
        }
      },
    });
  }, [
    createGameMutation,
    createBallMutation,
    createHouseMutation,
    createLeagueMutation,
    createPatternMutation,
    createSessionMutation,
    removeLeagueMutation,
    removeSessionMutation,
    replaceFramesMutation,
    updateLeagueMutation,
    updateSessionMutation,
    updateGameMutation,
  ]);

  useEffect(() => {
    void flushQueue();
  }, [flushQueue]);

  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void flushQueue();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [flushQueue]);

  useEffect(() => {
    const interval = setInterval(() => {
      void flushQueue();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [flushQueue]);

  return null;
}
