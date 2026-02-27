import { useConvexAuth, useMutation } from 'convex/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { deriveQueueSyncStatus } from '@/screens/game-editor/game-save-queue-status';
import { loadGameSaveQueue } from '@/screens/game-editor/game-save-queue-storage';
import {
  flushQueuedGameSavesWithLock,
  isQueuedGameSaveFlushInFlight,
} from '@/screens/game-editor/game-save-queue-sync';
import { loadJournalCreateQueue } from '@/screens/journal/journal-create-queue-storage';
import { flushJournalCreateQueueWithLock } from '@/screens/journal/journal-create-queue-sync';
import { subscribeQueueSyncState } from '@/screens/journal/queue-sync-events';
import { loadReferenceCreateQueue } from '@/screens/journal/reference-create-queue-storage';
import { flushReferenceCreateQueueWithLock } from '@/screens/journal/reference-create-queue-sync';
import { convexJournalService } from '@/services/journal';

type QueueStatusEntry = {
  createdAt: number;
  updatedAt: number;
  nextRetryAt: number;
  lastError: string | null;
};

export function useQueueSyncStatus() {
  const { isAuthenticated } = useConvexAuth();
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

  const [queueEntries, setQueueEntries] = useState<QueueStatusEntry[]>([]);
  const [checkedAt, setCheckedAt] = useState(Date.now());
  const [isRetryingNow, setIsRetryingNow] = useState(false);

  const refreshStatus = useCallback(async () => {
    const [gameEntries, createEntries, referenceCreateEntries] =
      await Promise.all([
        loadGameSaveQueue(),
        loadJournalCreateQueue(),
        loadReferenceCreateQueue(),
      ]);
    setQueueEntries([
      ...gameEntries,
      ...createEntries,
      ...referenceCreateEntries,
    ]);
    setCheckedAt(Date.now());
  }, []);

  const retryNow = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    setIsRetryingNow(true);

    try {
      await flushReferenceCreateQueueWithLock({
        createHouse: createHouseMutation,
        createPattern: createPatternMutation,
        createBall: createBallMutation,
        force: true,
      });

      await flushJournalCreateQueueWithLock({
        createLeague: createLeagueMutation,
        updateLeague: updateLeagueMutation,
        removeLeague: removeLeagueMutation,
        createSession: createSessionMutation,
        updateSession: updateSessionMutation,
        removeSession: removeSessionMutation,
        force: true,
      });
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
    createBallMutation,
    createHouseMutation,
    createLeagueMutation,
    createPatternMutation,
    createSessionMutation,
    isAuthenticated,
    removeLeagueMutation,
    removeSessionMutation,
    refreshStatus,
    replaceFramesMutation,
    updateLeagueMutation,
    updateSessionMutation,
    updateGameMutation,
  ]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (queueEntries.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      void refreshStatus();
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [queueEntries.length, refreshStatus]);

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

  useEffect(() => {
    const unsubscribe = subscribeQueueSyncState(() => {
      void refreshStatus();
    });

    return unsubscribe;
  }, [refreshStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onOnline = () => {
      void refreshStatus();
    };

    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('online', onOnline);
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
