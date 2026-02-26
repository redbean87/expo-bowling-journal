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
import { useGameEditorAutosaveSync } from './game-editor/use-game-editor-autosave-sync';
import { useGameEditorHydration } from './game-editor/use-game-editor-hydration';
import { useGameEditorRouteContext } from './game-editor/use-game-editor-route-context';
import { useSignedInHistory } from './game-editor/use-signed-in-history';
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
