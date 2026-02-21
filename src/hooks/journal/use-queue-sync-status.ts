import { useConvexAuth, useMutation } from 'convex/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { deriveQueueSyncStatus } from '@/screens/game-editor/game-save-queue-status';
import { loadGameSaveQueue } from '@/screens/game-editor/game-save-queue-storage';
import {
  flushQueuedGameSavesWithLock,
  isQueuedGameSaveFlushInFlight,
} from '@/screens/game-editor/game-save-queue-sync';
import { convexJournalService } from '@/services/journal';

export function useQueueSyncStatus() {
  const { isAuthenticated } = useConvexAuth();
  const createGameMutation = useMutation(convexJournalService.createGame);
  const updateGameMutation = useMutation(convexJournalService.updateGame);
  const replaceFramesMutation = useMutation(
    convexJournalService.replaceFramesForGame
  );

  const [queueEntries, setQueueEntries] = useState<
    Awaited<ReturnType<typeof loadGameSaveQueue>>
  >([]);
  const [checkedAt, setCheckedAt] = useState(Date.now());
  const [isRetryingNow, setIsRetryingNow] = useState(false);

  const refreshStatus = useCallback(async () => {
    const entries = await loadGameSaveQueue();
    setQueueEntries(entries);
    setCheckedAt(Date.now());
  }, []);

  const retryNow = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    setIsRetryingNow(true);

    try {
      await flushQueuedGameSavesWithLock({
        createGame: createGameMutation,
        updateGame: updateGameMutation,
        replaceFramesForGame: replaceFramesMutation,
        force: true,
      });
    } finally {
      setIsRetryingNow(false);
      await refreshStatus();
    }
  }, [
    createGameMutation,
    isAuthenticated,
    refreshStatus,
    replaceFramesMutation,
    updateGameMutation,
  ]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshStatus();
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [refreshStatus]);

  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refreshStatus();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [refreshStatus]);

  const status = useMemo(
    () =>
      deriveQueueSyncStatus(
        queueEntries,
        isQueuedGameSaveFlushInFlight() || isRetryingNow,
        checkedAt
      ),
    [checkedAt, isRetryingNow, queueEntries]
  );

  return {
    status,
    isRetryingNow,
    retryNow,
    refreshStatus,
  };
}
