import { useMutation } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { removeLocalGameDraft } from '@/screens/game-editor/game-local-draft-storage';
import { flushQueuedGameSavesWithLock } from '@/screens/game-editor/game-save-queue-sync';
import { flushJournalCreateQueueWithLock } from '@/screens/journal/journal-create-queue-sync';
import { isNavigatorOffline } from '@/screens/journal/journal-offline-create';
import { subscribeQueueSyncState } from '@/screens/journal/queue-sync-events';
import {
  didRestoreConnectivity,
  loadQueueSyncPresence,
  shouldRunQueueSyncInterval,
} from '@/screens/journal/queue-sync-presence';
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
  const [hasPendingEntries, setHasPendingEntries] = useState(false);
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState === 'active'
  );
  const [isOnline, setIsOnline] = useState(!isNavigatorOffline());
  const isOnlineRef = useRef(isOnline);

  const refreshQueuePresence = useCallback(async () => {
    const presence = await loadQueueSyncPresence();
    setHasPendingEntries(presence.hasPendingEntries);
    return presence;
  }, []);

  const flushQueue = useCallback(async () => {
    if (isNavigatorOffline()) {
      await refreshQueuePresence();
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

    await refreshQueuePresence();
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
    refreshQueuePresence,
  ]);

  const shouldPoll = useMemo(
    () =>
      shouldRunQueueSyncInterval({
        isAppActive,
        isOnline,
        hasPendingEntries,
      }),
    [hasPendingEntries, isAppActive, isOnline]
  );

  useEffect(() => {
    const initialFlush = setTimeout(() => {
      void refreshQueuePresence();
      void flushQueue();
    }, 0);

    return () => {
      clearTimeout(initialFlush);
    };
  }, [flushQueue, refreshQueuePresence]);

  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      const active = nextState === 'active';
      setIsAppActive(active);

      if (nextState === 'active') {
        void refreshQueuePresence();
        void flushQueue();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [flushQueue, refreshQueuePresence]);

  useEffect(() => {
    const unsubscribe = subscribeQueueSyncState(() => {
      void refreshQueuePresence();

      if (isAppActive && isOnlineRef.current) {
        void flushQueue();
      }
    });

    return unsubscribe;
  }, [flushQueue, isAppActive, refreshQueuePresence]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onOnline = () => {
      const nextOnline = true;
      const previousOnline = isOnlineRef.current;
      isOnlineRef.current = nextOnline;
      setIsOnline(nextOnline);

      if (didRestoreConnectivity({ previousOnline, nextOnline })) {
        void refreshQueuePresence();
        void flushQueue();
      }
    };

    const onOffline = () => {
      isOnlineRef.current = false;
      setIsOnline(false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushQueue, refreshQueuePresence]);

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    const interval = setInterval(() => {
      void flushQueue();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [flushQueue, shouldPoll]);

  return null;
}
