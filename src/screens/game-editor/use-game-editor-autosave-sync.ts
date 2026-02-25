import {
  useEffect,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { AppState } from 'react-native';

import { buildAutosaveGuardResult } from './game-editor-autosave-utils';
import {
  sanitizeFrameDraftsForEntry,
  type FrameDraft,
} from './game-editor-frame-utils';
import {
  buildGameSaveQueueId,
  createQueuedGameSaveEntry,
  getActionableSaveErrorMessage,
  getQueuedGameSaveEntry,
  isRetryableSaveError,
  upsertQueuedGameSaveEntry,
} from './game-save-queue';
import {
  persistGameSaveQueue,
  loadGameSaveQueue,
} from './game-save-queue-storage';
import {
  flushQueuedGameSavesWithLock,
  isQueuedGameSaveFlushInFlight,
} from './game-save-queue-sync';
import {
  buildPersistedSignature,
  buildSyncSignature,
  isOfflineLikely,
} from './game-editor-screen-utils';

import type {
  CreateGameInput,
  GameId,
  ReplaceFramesInput,
  SessionId,
  UpdateGameInput,
} from '@/services/journal';

type AutosaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'queued'
  | 'syncingQueued'
  | 'error';

type UseGameEditorAutosaveSyncInput = {
  didHydrate: boolean;
  isAuthenticated: boolean;
  hasSignedInBefore: boolean;
  isCreateMode: boolean;
  isDraftSessionContext: boolean;
  date: string;
  frameDrafts: FrameDraft[];
  setFrameDrafts: Dispatch<SetStateAction<FrameDraft[]>>;
  selectedPatternId: string | null;
  selectedBallId: string | null;
  draftGameId: GameId | null;
  setDraftGameId: Dispatch<SetStateAction<GameId | null>>;
  gameId: GameId | null;
  rawSessionId: string | null;
  sessionId: SessionId | null;
  gameSessionId: string | null;
  sessionClientSyncId: string | null;
  activeDraftNonce: string | null;
  createGame: (input: CreateGameInput) => Promise<GameId>;
  updateGame: (input: UpdateGameInput) => Promise<unknown>;
  replaceFramesForGame: (input: ReplaceFramesInput) => Promise<unknown>;
  replaceNewRouteWithGameId: (nextGameId: GameId) => void;
  clearLocalDraft: () => Promise<void>;
  setAutosaveState: Dispatch<SetStateAction<AutosaveState>>;
  setAutosaveError: Dispatch<SetStateAction<string | null>>;
  isAutosaveInFlightRef: MutableRefObject<boolean>;
  isQueuedFlushInFlightRef: MutableRefObject<boolean>;
  hasQueuedAutosaveRef: MutableRefObject<boolean>;
  saveSequenceRef: MutableRefObject<number>;
  lastSavedSignatureRef: MutableRefObject<string | null>;
  lastAppliedServerSignatureRef: MutableRefObject<string | null>;
};

export function useGameEditorAutosaveSync({
  didHydrate,
  isAuthenticated,
  hasSignedInBefore,
  isCreateMode,
  isDraftSessionContext,
  date,
  frameDrafts,
  setFrameDrafts,
  selectedPatternId,
  selectedBallId,
  draftGameId,
  setDraftGameId,
  gameId,
  rawSessionId,
  sessionId,
  gameSessionId,
  sessionClientSyncId,
  activeDraftNonce,
  createGame,
  updateGame,
  replaceFramesForGame,
  replaceNewRouteWithGameId,
  clearLocalDraft,
  setAutosaveState,
  setAutosaveError,
  isAutosaveInFlightRef,
  isQueuedFlushInFlightRef,
  hasQueuedAutosaveRef,
  saveSequenceRef,
  lastSavedSignatureRef,
  lastAppliedServerSignatureRef,
}: UseGameEditorAutosaveSyncInput) {
  const promoteDraftToQueue = useCallback(
    async ({ updateUi }: { updateUi: boolean }) => {
      const shouldQueueLocally =
        hasSignedInBefore && (!isAuthenticated || isOfflineLikely());

      if (!didHydrate || !shouldQueueLocally) {
        return false;
      }

      const activeGameId = draftGameId;
      const { drafts: sanitizedDrafts } =
        sanitizeFrameDraftsForEntry(frameDrafts);
      const autosavePlan = buildAutosaveGuardResult({
        isAuthenticated,
        hasSignedInBefore,
        date,
        frameDrafts: sanitizedDrafts,
        isCreateMode,
        currentGameId: activeGameId,
      });

      if (autosavePlan.status !== 'ready') {
        return false;
      }

      const queueSessionId = rawSessionId ?? gameSessionId;

      if (!queueSessionId) {
        return false;
      }

      const saveSignature = JSON.stringify({
        gameId: activeGameId ?? 'new',
        date: autosavePlan.trimmedDate,
        frames: autosavePlan.payloadFrames,
        patternId: selectedPatternId,
        ballId: selectedBallId,
      });

      const now = Date.now();
      const queueEntry = createQueuedGameSaveEntry(
        {
          sessionId: String(queueSessionId),
          sessionClientSyncId,
          gameId: activeGameId ? String(activeGameId) : null,
          draftNonce: activeGameId ? null : activeDraftNonce,
          date: autosavePlan.trimmedDate,
          frames: autosavePlan.payloadFrames,
          signature: saveSignature,
        },
        now
      );
      const queueEntries = upsertQueuedGameSaveEntry(
        await loadGameSaveQueue(),
        queueEntry
      );

      await persistGameSaveQueue(queueEntries);

      if (updateUi) {
        setAutosaveState('queued');
        setAutosaveError(null);
      }

      return true;
    },
    [
      activeDraftNonce,
      date,
      didHydrate,
      draftGameId,
      frameDrafts,
      gameSessionId,
      rawSessionId,
      hasSignedInBefore,
      isAuthenticated,
      isCreateMode,
      selectedBallId,
      selectedPatternId,
      sessionClientSyncId,
      setAutosaveError,
      setAutosaveState,
    ]
  );

  const flushQueuedSaves = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    if (isOfflineLikely()) {
      return;
    }

    if (isAutosaveInFlightRef.current || isQueuedFlushInFlightRef.current) {
      return;
    }

    isQueuedFlushInFlightRef.current = true;

    try {
      const queueEntries = await loadGameSaveQueue();
      const dueEntries = queueEntries
        .filter((entry) => entry.nextRetryAt <= Date.now())
        .sort((left, right) => left.updatedAt - right.updatedAt);

      if (dueEntries.length === 0) {
        return;
      }

      setAutosaveState((currentState) =>
        currentState === 'saving' ? currentState : 'syncingQueued'
      );

      const activeQueueIds = new Set<string>();

      if (sessionId) {
        const activeSessionId = String(sessionId);
        activeQueueIds.add(
          buildGameSaveQueueId(
            activeSessionId,
            draftGameId ?? gameId,
            activeDraftNonce
          )
        );
        activeQueueIds.add(
          buildGameSaveQueueId(activeSessionId, null, activeDraftNonce)
        );
        activeQueueIds.add(buildGameSaveQueueId(activeSessionId, null));
      }

      const { remainingEntries } = await flushQueuedGameSavesWithLock({
        createGame,
        updateGame,
        replaceFramesForGame,
        onEntrySynced: ({
          entry,
          originalQueueId,
          targetGameId,
          wasCreated,
        }) => {
          if (wasCreated) {
            setDraftGameId(targetGameId);
            replaceNewRouteWithGameId(targetGameId);
          }

          lastSavedSignatureRef.current = entry.signature;

          if (
            sessionId &&
            (activeQueueIds.has(entry.queueId) ||
              activeQueueIds.has(originalQueueId))
          ) {
            setAutosaveError(null);
            setAutosaveState('saved');
            void clearLocalDraft();
          }
        },
        onEntryFailedNonRetryable: ({ entry, originalQueueId, error }) => {
          const actionableMessage = getActionableSaveErrorMessage(error);

          if (
            actionableMessage &&
            (activeQueueIds.has(entry.queueId) ||
              activeQueueIds.has(originalQueueId))
          ) {
            setAutosaveState('error');
            setAutosaveError(actionableMessage);
          }
        },
      });

      if (remainingEntries.length > 0) {
        setAutosaveState('queued');
      } else {
        setAutosaveState((currentState) =>
          currentState === 'syncingQueued' ? 'saved' : currentState
        );
      }
    } finally {
      isQueuedFlushInFlightRef.current = false;
    }
  }, [
    activeDraftNonce,
    clearLocalDraft,
    createGame,
    draftGameId,
    gameId,
    isAuthenticated,
    isAutosaveInFlightRef,
    isQueuedFlushInFlightRef,
    replaceFramesForGame,
    replaceNewRouteWithGameId,
    sessionId,
    setAutosaveError,
    setAutosaveState,
    setDraftGameId,
    updateGame,
    lastSavedSignatureRef,
  ]);

  useEffect(() => {
    if (!didHydrate) {
      return;
    }

    void flushQueuedSaves();
  }, [didHydrate, flushQueuedSaves]);

  useEffect(() => {
    const onAppStateChange = (nextState: string) => {
      if (nextState === 'active') {
        void flushQueuedSaves();
        return;
      }

      void promoteDraftToQueue({ updateUi: false });
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [flushQueuedSaves, promoteDraftToQueue]);

  useEffect(() => {
    return () => {
      void promoteDraftToQueue({ updateUi: false });
    };
  }, [promoteDraftToQueue]);

  useEffect(() => {
    if (!didHydrate) {
      return;
    }

    const persist = async () => {
      if (isAutosaveInFlightRef.current || isQueuedFlushInFlightRef.current) {
        hasQueuedAutosaveRef.current = true;
        return;
      }

      if (isQueuedGameSaveFlushInFlight()) {
        hasQueuedAutosaveRef.current = true;
        return;
      }

      const activeGameId = draftGameId;
      const { drafts: sanitizedDrafts, changed } =
        sanitizeFrameDraftsForEntry(frameDrafts);

      if (changed) {
        setFrameDrafts(sanitizedDrafts);
      }

      const autosavePlan = buildAutosaveGuardResult({
        isAuthenticated,
        hasSignedInBefore,
        date,
        frameDrafts: sanitizedDrafts,
        isCreateMode,
        currentGameId: activeGameId,
      });

      if (autosavePlan.status === 'blocked') {
        setAutosaveState('error');
        setAutosaveError(autosavePlan.message);
        return;
      }

      if (autosavePlan.status === 'idle') {
        setAutosaveState('idle');
        return;
      }

      const { trimmedDate, payloadFrames } = autosavePlan;
      const saveSignature =
        buildPersistedSignature(
          activeGameId,
          trimmedDate,
          sanitizedDrafts,
          selectedPatternId,
          selectedBallId
        ) ??
        JSON.stringify({
          gameId: activeGameId ?? 'new',
          date: trimmedDate,
          frames: payloadFrames,
          patternId: selectedPatternId,
          ballId: selectedBallId,
        });

      if (saveSignature === lastSavedSignatureRef.current) {
        setAutosaveState('saved');
        return;
      }

      isAutosaveInFlightRef.current = true;
      setAutosaveState('saving');
      setAutosaveError(null);
      const saveSequence = saveSequenceRef.current + 1;
      saveSequenceRef.current = saveSequence;
      let attemptedGameId = activeGameId;

      const queueEntryForLocalSave = async () => {
        const queueSessionId = rawSessionId ?? sessionId ?? gameSessionId;

        if (!queueSessionId) {
          return false;
        }

        const now = Date.now();
        const queueEntry = createQueuedGameSaveEntry(
          {
            sessionId: String(queueSessionId),
            sessionClientSyncId,
            gameId: attemptedGameId ? String(attemptedGameId) : null,
            draftNonce: attemptedGameId ? null : activeDraftNonce,
            date: trimmedDate,
            frames: payloadFrames,
            signature: saveSignature,
          },
          now
        );
        const queueEntries = upsertQueuedGameSaveEntry(
          await loadGameSaveQueue(),
          queueEntry
        );

        await persistGameSaveQueue(queueEntries);

        if (saveSequenceRef.current === saveSequence) {
          setAutosaveState('queued');
          setAutosaveError(null);
        }

        return true;
      };

      try {
        if (
          hasSignedInBefore &&
          (!isAuthenticated || isOfflineLikely() || isDraftSessionContext)
        ) {
          if (await queueEntryForLocalSave()) {
            return;
          }
        }

        let nextGameId = activeGameId;

        if (isCreateMode) {
          if (!sessionId) {
            if (isDraftSessionContext && (await queueEntryForLocalSave())) {
              return;
            }

            throw new Error('Session is required when creating a game.');
          }

          if (!nextGameId) {
            const queueEntries = await loadGameSaveQueue();
            const pendingNewGameEntry = getQueuedGameSaveEntry(
              queueEntries,
              String(rawSessionId ?? sessionId),
              null,
              activeDraftNonce
            );

            if (pendingNewGameEntry) {
              if (await queueEntryForLocalSave()) {
                return;
              }
            }
          }

          if (!nextGameId) {
            nextGameId = await createGame({
              sessionId,
              date: trimmedDate,
              clientSyncId: activeDraftNonce,
              patternId: selectedPatternId as never,
              ballId: selectedBallId as never,
            });
            setDraftGameId(nextGameId);
            replaceNewRouteWithGameId(nextGameId);
          } else {
            await updateGame({
              gameId: nextGameId,
              date: trimmedDate,
              patternId: selectedPatternId as never,
              ballId: selectedBallId as never,
            });
          }
        } else {
          if (!nextGameId) {
            throw new Error('Game not found.');
          }

          await updateGame({
            gameId: nextGameId,
            date: trimmedDate,
            patternId: selectedPatternId as never,
            ballId: selectedBallId as never,
          });
        }

        if (!nextGameId) {
          throw new Error('Game not found.');
        }

        attemptedGameId = nextGameId;

        await replaceFramesForGame({
          gameId: nextGameId,
          frames: payloadFrames,
        });

        lastSavedSignatureRef.current = saveSignature;

        if (saveSequenceRef.current === saveSequence) {
          setAutosaveState('saved');
          setAutosaveError(null);
          void clearLocalDraft();
          lastAppliedServerSignatureRef.current = buildSyncSignature(
            nextGameId,
            trimmedDate,
            sanitizedDrafts,
            selectedPatternId,
            selectedBallId
          );
        }
      } catch (caught) {
        const actionableMessage = getActionableSaveErrorMessage(caught);

        if (isRetryableSaveError(caught)) {
          if (await queueEntryForLocalSave()) {
            return;
          }
        }

        if (saveSequenceRef.current === saveSequence) {
          setAutosaveState('error');
          setAutosaveError(
            actionableMessage ?? 'Unable to save game. Keep editing to retry.'
          );
        }
      } finally {
        isAutosaveInFlightRef.current = false;

        if (hasQueuedAutosaveRef.current) {
          hasQueuedAutosaveRef.current = false;
          void persist();
        }
      }
    };

    const timer = setTimeout(() => {
      void persist();
    }, 400);

    return () => clearTimeout(timer);
  }, [
    activeDraftNonce,
    clearLocalDraft,
    createGame,
    date,
    didHydrate,
    draftGameId,
    frameDrafts,
    gameSessionId,
    hasQueuedAutosaveRef,
    hasSignedInBefore,
    isAuthenticated,
    isAutosaveInFlightRef,
    isCreateMode,
    isDraftSessionContext,
    isQueuedFlushInFlightRef,
    lastAppliedServerSignatureRef,
    lastSavedSignatureRef,
    rawSessionId,
    replaceFramesForGame,
    replaceNewRouteWithGameId,
    saveSequenceRef,
    selectedBallId,
    selectedPatternId,
    sessionClientSyncId,
    sessionId,
    setAutosaveError,
    setAutosaveState,
    setDraftGameId,
    setFrameDrafts,
    updateGame,
  ]);
}
