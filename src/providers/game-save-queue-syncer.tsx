import { useMutation } from 'convex/react';
import { useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { removeLocalGameDraft } from '@/screens/game-editor/game-local-draft-storage';
import { flushQueuedGameSavesWithLock } from '@/screens/game-editor/game-save-queue-sync';
import { flushJournalCreateQueueWithLock } from '@/screens/journal/journal-create-queue-sync';
import { convexJournalService } from '@/services/journal';

export function GameSaveQueueSyncer() {
  const createGameMutation = useMutation(convexJournalService.createGame);
  const updateGameMutation = useMutation(convexJournalService.updateGame);
  const replaceFramesMutation = useMutation(
    convexJournalService.replaceFramesForGame
  );
  const createLeagueMutation = useMutation(convexJournalService.createLeague);
  const createSessionMutation = useMutation(convexJournalService.createSession);

  const flushQueue = useCallback(async () => {
    if (
      typeof globalThis.navigator !== 'undefined' &&
      globalThis.navigator.onLine === false
    ) {
      return;
    }

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

    await flushJournalCreateQueueWithLock({
      createLeague: createLeagueMutation,
      createSession: createSessionMutation,
    });
  }, [
    createGameMutation,
    createLeagueMutation,
    createSessionMutation,
    replaceFramesMutation,
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
