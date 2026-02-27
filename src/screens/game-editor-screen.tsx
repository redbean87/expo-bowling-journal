import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ActiveFrameCard } from './game-editor/active-frame-card';
import { FrameProgressStrip } from './game-editor/frame-progress-strip';
import { GameEditorDetailsSection } from './game-editor/game-editor-details-section';
import { GameEditorFooterActions } from './game-editor/game-editor-footer-actions';
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
  type FrameDraft,
  type RollField,
} from './game-editor/game-editor-frame-utils';
import {
  clearDownstreamRolls,
  createDraftNonce,
  getDefaultMaskForField,
  maskHasPin,
  setPinState,
  togglePinInMask,
} from './game-editor/game-editor-screen-utils';
import { removeLocalGameDraft } from './game-editor/game-local-draft-storage';
import { buildGameSaveQueueId } from './game-editor/game-save-queue';
import { loadGameSaveQueue } from './game-editor/game-save-queue-storage';
import { useGameEditorAutosaveSync } from './game-editor/use-game-editor-autosave-sync';
import { useGameEditorHydration } from './game-editor/use-game-editor-hydration';
import { useGameEditorRouteContext } from './game-editor/use-game-editor-route-context';
import { useSignedInHistory } from './game-editor/use-signed-in-history';
import {
  buildJournalGameEditorRouteParams,
  buildJournalGamesRouteParams,
  resolveJournalRouteIds,
} from './journal/journal-route-params';
import {
  formatGameSequenceLabel,
  formatIsoDateLabel,
  formatSessionWeekLabel,
  toOldestFirstGames,
} from './journal-fast-lane-utils';

import type { GameId } from '@/services/journal';

import {
  useGameEditor,
  useGames,
  useLeagues,
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
  const { leagues } = useLeagues();
  const { sessions } = useSessions(leagueId);
  const { scoreboardLayout } = usePreferences();

  const [date, setDate] = useState('');
  const [frameDrafts, setFrameDrafts] = useState<FrameDraft[]>(EMPTY_FRAMES);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [requestedActiveField, setActiveField] =
    useState<RollField>('roll1Mask');
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [isCanonicalizingRoutePending, setIsCanonicalizingRoutePending] =
    useState(false);
  const isCanonicalizingRoute =
    isCanonicalizingRoutePending && gameIdParam === 'new';
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(
    null
  );
  const [selectedBallId, setSelectedBallId] = useState<string | null>(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [queuedSessionGameEntries, setQueuedSessionGameEntries] = useState<
    Awaited<ReturnType<typeof loadGameSaveQueue>>
  >([]);

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
  const activeDraftNonce = useMemo(() => {
    if (!isCreateMode) {
      return null;
    }

    return draftNonceParam && draftNonceParam.trim().length > 0
      ? draftNonceParam
      : createDraftNonce();
  }, [draftNonceParam, isCreateMode]);
  const activeSessionQueueKey =
    rawSessionId ?? (sessionId ? String(sessionId) : null);
  const queuedNewGamesInSession = useMemo(() => {
    return [...queuedSessionGameEntries]
      .filter((entry) => entry.gameId === null)
      .sort((left, right) => left.createdAt - right.createdAt);
  }, [queuedSessionGameEntries]);
  const createModeGameNumber = useMemo(() => {
    const serverGameCount = orderedSessionGames.length;

    if (!isCreateMode) {
      return serverGameCount + 1;
    }

    if (activeDraftNonce) {
      const queuedIndex = queuedNewGamesInSession.findIndex(
        (entry) => entry.draftNonce === activeDraftNonce
      );

      if (queuedIndex >= 0) {
        return serverGameCount + queuedIndex + 1;
      }
    }

    return serverGameCount + queuedNewGamesInSession.length + 1;
  }, [
    activeDraftNonce,
    isCreateMode,
    orderedSessionGames.length,
    queuedNewGamesInSession,
  ]);
  const gameName = useMemo(() => {
    if (isCreateMode) {
      return formatGameSequenceLabel(createModeGameNumber);
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
  }, [createModeGameNumber, gameId, isCreateMode, orderedSessionGames]);
  const selectedLeague = useMemo(() => {
    if (leagueId) {
      return leagues.find((candidate) => candidate._id === leagueId) ?? null;
    }

    if (!leagueClientSyncId) {
      return null;
    }

    return (
      leagues.find((candidate) => {
        const clientSyncId =
          typeof (candidate as { clientSyncId?: string | null })
            .clientSyncId === 'string'
            ? (candidate as { clientSyncId?: string | null }).clientSyncId
            : null;

        return clientSyncId === leagueClientSyncId;
      }) ?? null
    );
  }, [leagueClientSyncId, leagueId, leagues]);
  const targetGames = useMemo<number | null>(() => {
    const gamesPerSession = selectedLeague?.gamesPerSession;

    if (typeof gamesPerSession !== 'number') {
      return null;
    }

    if (!Number.isInteger(gamesPerSession) || gamesPerSession < 1) {
      return null;
    }

    return gamesPerSession;
  }, [selectedLeague?.gamesPerSession]);
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
  const localDraftId = useMemo(() => {
    const activeSessionId =
      rawSessionId ?? (sessionId ? String(sessionId) : null);

    if (!activeSessionId) {
      return null;
    }

    return buildGameSaveQueueId(activeSessionId, gameId, activeDraftNonce);
  }, [activeDraftNonce, gameId, rawSessionId, sessionId]);
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
  const currentGameNumber = useMemo(() => {
    if (isCreateMode) {
      return createModeGameNumber;
    }

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

    return currentGameIndex + 1;
  }, [
    createModeGameNumber,
    draftGameId,
    gameId,
    isCreateMode,
    orderedSessionGames,
  ]);

  useEffect(() => {
    let isMounted = true;

    const refreshQueuedSessionGames = async () => {
      if (!activeSessionQueueKey && !sessionClientSyncId) {
        if (isMounted) {
          setQueuedSessionGameEntries([]);
        }
        return;
      }

      const queueEntries = await loadGameSaveQueue();
      const filteredEntries = queueEntries.filter(
        (entry) =>
          (activeSessionQueueKey !== null &&
            entry.sessionId === activeSessionQueueKey) ||
          (sessionClientSyncId !== null &&
            entry.sessionClientSyncId === sessionClientSyncId)
      );

      if (!isMounted) {
        return;
      }

      setQueuedSessionGameEntries((currentEntries) => {
        if (
          currentEntries.length === filteredEntries.length &&
          currentEntries.every((entry, index) => {
            const other = filteredEntries[index];
            return (
              other &&
              entry.queueId === other.queueId &&
              entry.updatedAt === other.updatedAt &&
              entry.signature === other.signature
            );
          })
        ) {
          return currentEntries;
        }

        return filteredEntries;
      });
    };

    void refreshQueuedSessionGames();
    const intervalId = setInterval(() => {
      void refreshQueuedSessionGames();
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [activeSessionQueueKey, sessionClientSyncId]);

  const activeFrame = frameDrafts[activeFrameIndex] ?? EMPTY_FRAMES[0];
  const visibleRollFields = getVisibleRollFields(activeFrameIndex, activeFrame);
  const activeField = visibleRollFields.includes(requestedActiveField)
    ? requestedActiveField
    : getPreferredRollField(activeFrameIndex, activeFrame);
  const frameRuleError = getFrameInlineError(activeFrameIndex, activeFrame);
  const inlineError = frameRuleError;
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
  const shouldPreferFinishAction = useMemo(() => {
    if (!shouldShowCompletionActions || targetGames === null) {
      return false;
    }

    if (currentGameNumber === null || currentGameNumber < targetGames) {
      return false;
    }

    return nextExistingGameId === null;
  }, [
    currentGameNumber,
    nextExistingGameId,
    shouldShowCompletionActions,
    targetGames,
  ]);
  const {
    leagueRouteId: targetLeagueRouteId,
    sessionRouteId: targetSessionRouteId,
  } = resolveJournalRouteIds({
    leagueId,
    rawLeagueId,
    sessionId,
    rawSessionId,
  });
  const canNavigateSessionFlows = Boolean(
    targetLeagueRouteId && targetSessionRouteId
  );
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

  const replaceNewRouteWithGameId = useCallback(
    (nextGameId: GameId) => {
      if (gameIdParam !== 'new') {
        return;
      }

      setIsCanonicalizingRoutePending(true);
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
    navigation.setOptions({
      headerTitle: gameName,
      title: sessionContextLabel ?? gameName,
    });
  }, [gameName, navigation, sessionContextLabel]);

  useGameEditorAutosaveSync({
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
    gameSessionId: game?.sessionId ?? null,
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
  });

  const onSelectFrame = (frameIndex: number) => {
    setActiveFrameIndex(frameIndex);
    setActiveField('roll1Mask');
  };

  const updateActiveFrame = (
    updater: (frame: FrameDraft) => FrameDraft,
    nextField?: RollField
  ) => {
    setAutosaveError(null);

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
    if (!targetLeagueRouteId || !targetSessionRouteId) {
      return;
    }

    router.replace({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games',
      params: buildJournalGamesRouteParams({
        leagueId: targetLeagueRouteId,
        sessionId: targetSessionRouteId,
        leagueClientSyncId,
        sessionClientSyncId,
      }),
    });
  };

  const onGoToNextGame = () => {
    if (!targetLeagueRouteId || !targetSessionRouteId) {
      return;
    }

    if (nextExistingGameId) {
      router.replace({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
        params: buildJournalGameEditorRouteParams({
          leagueId: targetLeagueRouteId,
          sessionId: targetSessionRouteId,
          leagueClientSyncId,
          sessionClientSyncId,
          gameId: nextExistingGameId,
        }),
      });
      return;
    }

    router.replace({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
      params: buildJournalGameEditorRouteParams({
        leagueId: targetLeagueRouteId,
        sessionId: targetSessionRouteId,
        leagueClientSyncId,
        sessionClientSyncId,
        gameId: 'new',
        draftNonce: createDraftNonce(),
      }),
    });
  };

  const onToggleDetails = () => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }

    setIsDetailsVisible((current) => !current);
  };

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

        <GameEditorDetailsSection
          ballOptions={ballOptions}
          buildSuggestions={buildSuggestions}
          createBall={createBall}
          createPattern={createPattern}
          isDetailsVisible={isDetailsVisible}
          onSelectBall={(option) => setSelectedBallId(option.id)}
          onSelectPattern={(option) => setSelectedPatternId(option.id)}
          onToggleDetails={onToggleDetails}
          patternOptions={patternOptions}
          recentBallOptions={recentBallOptions}
          recentPatternOptions={recentPatternOptions}
          selectedBallId={selectedBallId}
          selectedPatternId={selectedPatternId}
        />

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

      <GameEditorFooterActions
        canNavigateSessionFlows={canNavigateSessionFlows}
        onCommitRoll={onCommitRoll}
        onGoToGames={onGoToGames}
        onGoToNextGame={onGoToNextGame}
        onSetFullRack={onSetFullRack}
        shouldPreferFinishAction={shouldPreferFinishAction}
        shouldShowCompletionActions={shouldShowCompletionActions}
        shortcutLabel={shortcutLabel}
      />
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
});
