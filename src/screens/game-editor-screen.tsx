import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type AppStateStatus,
  View,
} from 'react-native';

import { ActiveFrameCard } from './game-editor/active-frame-card';
import { FrameProgressStrip } from './game-editor/frame-progress-strip';
import { buildAutosaveGuardResult } from './game-editor/game-editor-autosave-utils';
import {
  EMPTY_FRAMES,
  FULL_PIN_MASK,
  findSuggestedFrameIndex,
  getFrameInlineError,
  getFrameStatus,
  getNextCursorAfterEntry,
  getPreferredRollField,
  getRollValue,
  getStandingMaskForField,
  getVisibleRollFields,
  sanitizeFrameDraftsForEntry,
  type FrameDraft,
  type RollField,
} from './game-editor/game-editor-frame-utils';
import {
  buildPersistedSignature,
  buildSyncSignature,
  clearDownstreamRolls,
  createDraftNonce,
  getDefaultMaskForField,
  isOfflineLikely,
  maskHasPin,
  setPinState,
  togglePinInMask,
} from './game-editor/game-editor-screen-utils';
import { removeLocalGameDraft } from './game-editor/game-local-draft-storage';
import {
  buildGameSaveQueueId,
  createQueuedGameSaveEntry,
  getActionableSaveErrorMessage,
  getQueuedGameSaveEntry,
  isRetryableSaveError,
  upsertQueuedGameSaveEntry,
} from './game-editor/game-save-queue';
import {
  loadGameSaveQueue,
  persistGameSaveQueue,
} from './game-editor/game-save-queue-storage';
import {
  flushQueuedGameSavesWithLock,
  isQueuedGameSaveFlushInFlight,
} from './game-editor/game-save-queue-sync';
import { useGameEditorRouteContext } from './game-editor/use-game-editor-route-context';
import { useGameEditorHydration } from './game-editor/use-game-editor-hydration';
import { useSignedInHistory } from './game-editor/use-signed-in-history';
import {
  formatGameSequenceLabel,
  formatIsoDateLabel,
  formatSessionWeekLabel,
  toOldestFirstGames,
} from './journal-fast-lane-utils';

import type { GameId } from '@/services/journal';

import { ReferenceCombobox } from '@/components/reference-combobox';
import { Button } from '@/components/ui';
import {
  useGameEditor,
  useGames,
  useReferenceData,
  useSessions,
} from '@/hooks/journal';
import { usePreferences } from '@/providers/preferences-provider';
import { colors, spacing, typeScale } from '@/theme/tokens';

type CursorTarget = {
  frameIndex: number;
  field: RollField;
};

type AutosaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'queued'
  | 'syncingQueued'
  | 'error';

export default function GameEditorScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const {
    rawLeagueId,
    leagueClientSyncId,
    gameIdParam,
    draftNonceParam,
    isCreateMode,
    gameId,
    rawSessionId,
    sessionClientSyncId,
    leagueId,
    sessionId,
    isDraftSessionContext,
  } = useGameEditorRouteContext();

  const {
    game,
    frames,
    isAuthenticated,
    isLoading,
    createGame,
    updateGame,
    replaceFramesForGame,
  } = useGameEditor(gameId);
  const { games: sessionGames } = useGames(sessionId);
  const { sessions } = useSessions(leagueId);
  const { scoreboardLayout } = usePreferences();

  const [date, setDate] = useState('');
  const [frameDrafts, setFrameDrafts] = useState<FrameDraft[]>(EMPTY_FRAMES);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [activeField, setActiveField] = useState<RollField>('roll1Mask');
  const [inputError, setInputError] = useState<string | null>(null);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [isCanonicalizingRoute, setIsCanonicalizingRoute] = useState(false);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(
    null
  );
  const [selectedBallId, setSelectedBallId] = useState<string | null>(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);

  const isAutosaveInFlightRef = useRef(false);
  const isQueuedFlushInFlightRef = useRef(false);
  const hasQueuedAutosaveRef = useRef(false);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const lastAppliedServerSignatureRef = useRef<string | null>(null);
  const saveSequenceRef = useRef(0);
  const {
    ballOptions,
    patternOptions,
    recentBallOptions,
    recentPatternOptions,
    buildSuggestions,
    createBall,
    createPattern,
  } = useReferenceData();
  const hasSignedInBefore = useSignedInHistory(isAuthenticated);

  const orderedSessionGames = useMemo(
    () => toOldestFirstGames(sessionGames),
    [sessionGames]
  );
  const gameName = useMemo(() => {
    if (isCreateMode) {
      return formatGameSequenceLabel(orderedSessionGames.length + 1);
    }

    if (!gameId) {
      return 'Game';
    }

    const gameIndex = orderedSessionGames.findIndex(
      (candidate) => candidate._id === gameId
    );

    if (gameIndex === -1) {
      return 'Game';
    }

    return formatGameSequenceLabel(gameIndex + 1);
  }, [gameId, isCreateMode, orderedSessionGames]);
  const derivedWeekNumberBySessionId = useMemo(() => {
    const oldestFirstSessions = [...sessions].reverse();
    const weekMap = new Map<string, number>();

    oldestFirstSessions.forEach((session, index) => {
      const fallbackWeek = index + 1;
      weekMap.set(session._id, session.weekNumber ?? fallbackWeek);
    });

    return weekMap;
  }, [sessions]);
  const selectedSession = useMemo(() => {
    if (!sessionId) {
      return null;
    }

    return sessions.find((candidate) => candidate._id === sessionId) ?? null;
  }, [sessionId, sessions]);
  const sessionContextLabel = useMemo(() => {
    if (!selectedSession) {
      return null;
    }

    const weekNumber =
      selectedSession.weekNumber ??
      derivedWeekNumberBySessionId.get(selectedSession._id) ??
      null;
    const weekLabel =
      weekNumber === null ? null : formatSessionWeekLabel(weekNumber);
    const dateLabel = formatIsoDateLabel(selectedSession.date);

    if (weekLabel) {
      return `${weekLabel} · ${dateLabel}`;
    }

    return dateLabel;
  }, [derivedWeekNumberBySessionId, selectedSession]);
  const activeDraftNonce = useMemo(() => {
    if (!isCreateMode) {
      return null;
    }

    return draftNonceParam && draftNonceParam.trim().length > 0
      ? draftNonceParam
      : createDraftNonce();
  }, [draftNonceParam, isCreateMode]);
  const localDraftId = useMemo(() => {
    if (!sessionId) {
      return null;
    }

    return buildGameSaveQueueId(String(sessionId), gameId, activeDraftNonce);
  }, [activeDraftNonce, gameId, sessionId]);
  const { didHydrate, draftGameId, setDraftGameId } = useGameEditorHydration({
    game,
    frames,
    gameId,
    isAuthenticated,
    isCreateMode,
    localDraftId,
    date,
    frameDrafts,
    selectedPatternId,
    selectedBallId,
    autosaveState,
    setDate,
    setFrameDrafts,
    setActiveFrameIndex,
    setActiveField,
    setSelectedPatternId,
    setSelectedBallId,
    lastAppliedServerSignatureRef,
    lastSavedSignatureRef,
  });
  const nextExistingGameId = useMemo(() => {
    const currentGameId = draftGameId ?? gameId;

    if (!currentGameId) {
      return null;
    }

    const currentGameIndex = orderedSessionGames.findIndex(
      (candidate) => candidate._id === currentGameId
    );

    if (currentGameIndex === -1) {
      return null;
    }

    return orderedSessionGames[currentGameIndex + 1]?._id ?? null;
  }, [draftGameId, gameId, orderedSessionGames]);

  const activeFrame = frameDrafts[activeFrameIndex] ?? EMPTY_FRAMES[0];
  const visibleRollFields = getVisibleRollFields(activeFrameIndex, activeFrame);
  const frameRuleError = getFrameInlineError(activeFrameIndex, activeFrame);
  const inlineError = inputError ?? frameRuleError;
  const activeStandingMask = getStandingMaskForField(
    activeFrameIndex,
    activeFrame,
    activeField
  );
  const activeRollMask =
    activeFrame[activeField] ??
    getDefaultMaskForField(activeFrameIndex, activeField, activeStandingMask);
  const shortcutLabel =
    activeStandingMask === FULL_PIN_MASK ? 'Strike' : 'Spare';
  const isGameComplete = useMemo(
    () =>
      frameDrafts.every(
        (frame, frameIndex) => getFrameStatus(frameIndex, frame) === 'complete'
      ),
    [frameDrafts]
  );
  const terminalCursor = useMemo(() => {
    const frameIndex = findSuggestedFrameIndex(frameDrafts);
    const frame = frameDrafts[frameIndex] ?? EMPTY_FRAMES[0];

    return {
      frameIndex,
      field: getPreferredRollField(frameIndex, frame),
    } satisfies CursorTarget;
  }, [frameDrafts]);
  const shouldShowCompletionActions =
    isGameComplete &&
    activeFrameIndex === terminalCursor.frameIndex &&
    activeField === terminalCursor.field;
  const canNavigateSessionFlows = Boolean(leagueId && sessionId);
  const autosaveMessage = useMemo(() => {
    if (autosaveState === 'error') {
      if (autosaveError && autosaveError === frameRuleError) {
        return '';
      }

      return autosaveError ?? 'Auto-save failed. Keep editing to retry.';
    }

    return '';
  }, [autosaveError, autosaveState, frameRuleError]);

  const moveCursor = ({ frameIndex, field }: CursorTarget) => {
    setActiveFrameIndex(frameIndex);
    setActiveField(field);
  };

  const clearLocalDraft = useCallback(async () => {
    if (!localDraftId) {
      return;
    }

    await removeLocalGameDraft(localDraftId);
  }, [localDraftId]);

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

      const queueSessionId = rawSessionId ?? game?.sessionId;

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
      game?.sessionId,
      rawSessionId,
      hasSignedInBefore,
      isAuthenticated,
      isCreateMode,
      selectedBallId,
      selectedPatternId,
      sessionClientSyncId,
    ]
  );

  const replaceNewRouteWithGameId = useCallback(
    (nextGameId: GameId) => {
      if (gameIdParam !== 'new') {
        return;
      }

      setIsCanonicalizingRoute(true);
      navigation.setParams({
        leagueId: rawLeagueId ?? `draft-${leagueClientSyncId ?? 'league'}`,
        sessionId: rawSessionId ?? `draft-${sessionClientSyncId ?? 'session'}`,
        gameId: nextGameId,
      } as never);
    },
    [
      gameIdParam,
      leagueClientSyncId,
      navigation,
      rawLeagueId,
      rawSessionId,
      sessionClientSyncId,
    ]
  );

  useEffect(() => {
    if (gameIdParam !== 'new') {
      setIsCanonicalizingRoute(false);
    }
  }, [gameIdParam]);

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
    clearLocalDraft,
    createGame,
    activeDraftNonce,
    draftGameId,
    gameId,
    isAuthenticated,
    replaceNewRouteWithGameId,
    replaceFramesForGame,
    sessionId,
    updateGame,
  ]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: gameName,
      title: sessionContextLabel ?? gameName,
    });
  }, [gameName, navigation, sessionContextLabel]);

  useEffect(() => {
    if (!didHydrate) {
      return;
    }

    void flushQueuedSaves();
  }, [didHydrate, flushQueuedSaves]);

  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
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
    setInputError(null);
  }, [activeFrameIndex, activeField]);

  useEffect(() => {
    if (visibleRollFields.includes(activeField)) {
      return;
    }

    const preferredField = getPreferredRollField(activeFrameIndex, activeFrame);
    setActiveField(preferredField);
  }, [activeField, activeFrame, activeFrameIndex, visibleRollFields]);

  const onSelectFrame = (frameIndex: number) => {
    setActiveFrameIndex(frameIndex);
    setActiveField('roll1Mask');
    setInputError(null);
  };

  const updateActiveFrame = (
    updater: (frame: FrameDraft) => FrameDraft,
    nextField?: RollField
  ) => {
    setAutosaveError(null);
    setInputError(null);

    setFrameDrafts((currentDrafts) => {
      const nextDrafts = [...currentDrafts];
      const currentFrame = nextDrafts[activeFrameIndex] ?? EMPTY_FRAMES[0];
      nextDrafts[activeFrameIndex] = updater(currentFrame);
      return nextDrafts;
    });

    if (nextField) {
      setActiveField(nextField);
    }
  };

  const onTogglePin = (pinNumber: number) => {
    if (!maskHasPin(activeStandingMask, pinNumber)) {
      return;
    }

    updateActiveFrame((frame) => {
      const standingMask = getStandingMaskForField(
        activeFrameIndex,
        frame,
        activeField
      );
      const currentMask =
        frame[activeField] ??
        getDefaultMaskForField(activeFrameIndex, activeField, standingMask);
      const nextMask = togglePinInMask(currentMask, pinNumber);
      const nextBaseFrame =
        nextMask === currentMask
          ? frame
          : clearDownstreamRolls(frame, activeField);

      return {
        ...nextBaseFrame,
        [activeField]: nextMask,
      };
    });
  };

  const onSetPinKnocked = (pinNumber: number) => {
    if (!maskHasPin(activeStandingMask, pinNumber)) {
      return;
    }

    updateActiveFrame((frame) => {
      const standingMask = getStandingMaskForField(
        activeFrameIndex,
        frame,
        activeField
      );
      const currentMask =
        frame[activeField] ??
        getDefaultMaskForField(activeFrameIndex, activeField, standingMask);
      const nextMask = setPinState(currentMask, pinNumber, true);
      const nextBaseFrame =
        nextMask === currentMask
          ? frame
          : clearDownstreamRolls(frame, activeField);

      return {
        ...nextBaseFrame,
        [activeField]: nextMask,
      };
    });
  };

  const onSetPinStanding = (pinNumber: number) => {
    if (!maskHasPin(activeStandingMask, pinNumber)) {
      return;
    }

    updateActiveFrame((frame) => {
      const standingMask = getStandingMaskForField(
        activeFrameIndex,
        frame,
        activeField
      );
      const currentMask =
        frame[activeField] ??
        getDefaultMaskForField(activeFrameIndex, activeField, standingMask);
      const nextMask = setPinState(currentMask, pinNumber, false);
      const nextBaseFrame =
        nextMask === currentMask
          ? frame
          : clearDownstreamRolls(frame, activeField);

      return {
        ...nextBaseFrame,
        [activeField]: nextMask,
      };
    });
  };

  const commitActiveRoll = (nextMask: number) => {
    let committedFrame: FrameDraft | null = null;

    updateActiveFrame((frame) => {
      const standingMask = getStandingMaskForField(
        activeFrameIndex,
        frame,
        activeField
      );
      const currentMask =
        frame[activeField] ??
        getDefaultMaskForField(activeFrameIndex, activeField, standingMask);
      const resetFrame =
        currentMask === nextMask
          ? frame
          : clearDownstreamRolls(frame, activeField);
      const nextFrame = {
        ...resetFrame,
        [activeField]: nextMask,
      };

      if (activeField === 'roll1Mask') {
        const roll1 = getRollValue(nextFrame.roll1Mask);

        if (activeFrameIndex < 9 && roll1 === 10) {
          nextFrame.roll2Mask = null;
          nextFrame.roll3Mask = null;
        }
      }

      if (activeField === 'roll2Mask') {
        const roll1 = getRollValue(nextFrame.roll1Mask);
        const roll2 = getRollValue(nextFrame.roll2Mask);

        if (
          activeFrameIndex < 9 &&
          roll1 !== null &&
          roll1 + (roll2 ?? 0) > 10
        ) {
          return frame;
        }

        if (
          activeFrameIndex === 9 &&
          roll1 !== null &&
          roll2 !== null &&
          roll1 < 10 &&
          roll1 + roll2 > 10
        ) {
          return frame;
        }

        if (
          activeFrameIndex === 9 &&
          roll1 !== null &&
          roll2 !== null &&
          roll1 < 10 &&
          roll1 + roll2 < 10
        ) {
          nextFrame.roll3Mask = null;
        }
      }

      committedFrame = nextFrame;
      return nextFrame;
    });

    if (!committedFrame) {
      return;
    }

    const cursor = getNextCursorAfterEntry(
      activeFrameIndex,
      activeField,
      committedFrame
    );

    if (cursor) {
      moveCursor(cursor);
    }
  };

  const onSetFullRack = () => {
    commitActiveRoll(activeStandingMask);
  };

  const onCommitRoll = () => {
    commitActiveRoll(activeRollMask);
  };

  const onGoToGames = () => {
    if (!leagueId || !sessionId) {
      return;
    }

    router.replace({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games',
      params: {
        leagueId,
        sessionId,
      },
    });
  };

  const onGoToNextGame = () => {
    if (!leagueId || !sessionId) {
      return;
    }

    if (nextExistingGameId) {
      router.replace({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
        params: {
          leagueId,
          sessionId,
          gameId: nextExistingGameId,
        },
      });
      return;
    }

    router.replace({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
      params: {
        leagueId,
        sessionId,
        gameId: 'new',
        draftNonce: createDraftNonce(),
      },
    });
  };

  const onToggleDetails = () => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }

    setIsDetailsVisible((current) => !current);
  };

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
        const queueSessionId = rawSessionId ?? sessionId ?? game?.sessionId;

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
    createGame,
    activeDraftNonce,
    date,
    didHydrate,
    draftGameId,
    frameDrafts,
    game,
    hasSignedInBefore,
    isAuthenticated,
    isCreateMode,
    isDraftSessionContext,
    rawSessionId,
    replaceNewRouteWithGameId,
    replaceFramesForGame,
    sessionClientSyncId,
    sessionId,
    updateGame,
    clearLocalDraft,
    selectedBallId,
    selectedPatternId,
  ]);

  if (!isCreateMode && isLoading && !didHydrate && !isCanonicalizingRoute) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading game...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <FrameProgressStrip
          activeField={activeField}
          activeFrameIndex={activeFrameIndex}
          frameDrafts={frameDrafts}
          layoutMode={scoreboardLayout}
          onSelectFrame={onSelectFrame}
        />

        <View
          style={[
            styles.detailsSection,
            isDetailsVisible ? styles.detailsSectionOpen : null,
          ]}
        >
          <Pressable
            onPress={onToggleDetails}
            style={({ pressed }) => [
              styles.detailsToggle,
              pressed ? styles.detailsTogglePressed : null,
            ]}
          >
            <Text style={styles.detailsToggleLabel}>
              {isDetailsVisible ? 'Hide details' : 'Add details'}
            </Text>
          </Pressable>

          {isDetailsVisible ? (
            <View style={styles.detailsFields}>
              <ReferenceCombobox
                allOptions={patternOptions}
                createLabel="Add pattern"
                getSuggestions={buildSuggestions}
                onQuickAdd={createPattern}
                onSelect={(option) => setSelectedPatternId(option.id)}
                placeholder="Pattern (optional)"
                recentOptions={recentPatternOptions}
                valueId={selectedPatternId}
              />
              <ReferenceCombobox
                allOptions={ballOptions}
                createLabel="Add ball"
                getSuggestions={buildSuggestions}
                onQuickAdd={createBall}
                onSelect={(option) => setSelectedBallId(option.id)}
                placeholder="Ball (optional)"
                recentOptions={recentBallOptions}
                valueId={selectedBallId}
              />
            </View>
          ) : null}
        </View>

        <ActiveFrameCard
          activeRollMask={activeRollMask}
          activeStandingMask={activeStandingMask}
          autosaveMessage={autosaveMessage}
          autosaveState={autosaveState}
          inlineError={inlineError}
          onSetPinKnocked={onSetPinKnocked}
          onSetPinStanding={onSetPinStanding}
          onTogglePin={onTogglePin}
        />
      </View>

      <View style={styles.actionsFooter}>
        <View style={styles.actionsRow}>
          <View style={styles.stickyActionButton}>
            {shouldShowCompletionActions ? (
              <Button
                disabled={!canNavigateSessionFlows}
                label="Games"
                onPress={onGoToGames}
                size="lg"
                variant="secondary"
              />
            ) : (
              <Pressable
                onPress={onSetFullRack}
                style={({ pressed }) => [
                  styles.strikeButton,
                  pressed ? styles.strikeButtonPressed : null,
                ]}
              >
                <Text style={styles.strikeButtonLabel}>{shortcutLabel}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.stickyActionButton}>
            {shouldShowCompletionActions ? (
              <Button
                disabled={!canNavigateSessionFlows}
                label="Next game"
                onPress={onGoToNextGame}
                size="lg"
              />
            ) : (
              <Button label="Next" onPress={onCommitRoll} size="lg" />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  detailsSection: {
    gap: spacing.xs,
  },
  detailsSectionOpen: {
    position: 'relative',
    zIndex: 30,
    elevation: 30,
  },
  detailsToggle: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  detailsTogglePressed: {
    opacity: 0.75,
  },
  detailsToggleLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.accent,
  },
  detailsFields: {
    gap: spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: typeScale.body,
    color: colors.textSecondary,
  },
  actionsFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stickyActionButton: {
    flex: 1,
  },
  strikeButton: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  strikeButtonPressed: {
    opacity: 0.82,
  },
  strikeButtonLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.accent,
  },
});
