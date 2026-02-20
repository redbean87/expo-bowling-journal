import { useMutation } from 'convex/react';
import { useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { flushQueuedGameSavesWithLock } from '@/screens/game-editor/game-save-queue-sync';
import { convexJournalService } from '@/services/journal';

export function GameSaveQueueSyncer() {
  const createGameMutation = useMutation(convexJournalService.createGame);
  const updateGameMutation = useMutation(convexJournalService.updateGame);
  const replaceFramesMutation = useMutation(
    convexJournalService.replaceFramesForGame
  );

  const flushQueue = useCallback(async () => {
    await flushQueuedGameSavesWithLock({
      createGame: createGameMutation,
      updateGame: updateGameMutation,
      replaceFramesForGame: replaceFramesMutation,
    });
  }, [createGameMutation, replaceFramesMutation, updateGameMutation]);

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
