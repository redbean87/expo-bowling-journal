import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ActiveFrameCard } from './game-editor/active-frame-card';
import { FrameProgressStrip } from './game-editor/frame-progress-strip';
import { buildAutosaveGuardResult } from './game-editor/game-editor-autosave-utils';
import {
  EMPTY_FRAMES,
  FULL_PIN_MASK,
  findSuggestedFrameIndex,
  getFirstParam,
  getFrameInlineError,
  getNextCursorAfterEntry,
  getPreferredRollField,
  getRollValue,
  getStandingMaskForField,
  getTenthFrameHint,
  getVisibleRollFields,
  normalizeDateValue,
  sanitizeFrameDraftsForEntry,
  toFrameDrafts,
  type FrameDraft,
  type RollField,
} from './game-editor/game-editor-frame-utils';

import type { GameId, SessionId } from '@/services/journal';

import { Button } from '@/components/ui';
import { useGameEditor } from '@/hooks/journal';
import { usePreferences } from '@/providers/preferences-provider';
import { colors, spacing, typeScale } from '@/theme/tokens';

type CursorTarget = {
  frameIndex: number;
  field: RollField;
};

type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

function togglePinInMask(mask: number, pinNumber: number) {
  return mask ^ (1 << (pinNumber - 1));
}

function maskHasPin(mask: number, pinNumber: number) {
  return (mask & (1 << (pinNumber - 1))) !== 0;
}

function getDefaultMaskForField(
  frameIndex: number,
  field: RollField,
  standingMask: number
) {
  if (field === 'roll1Mask') {
    return standingMask;
  }

  if (frameIndex === 9 && standingMask === 0x3ff) {
    return standingMask;
  }

  return 0;
}

export default function GameEditorScreen() {
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    leagueId?: string | string[];
    gameId?: string | string[];
    sessionId?: string | string[];
  }>();

  const gameIdParam = getFirstParam(params.gameId);
  const isCreateMode = gameIdParam === 'new';
  const gameId = isCreateMode ? null : (gameIdParam as GameId | null);
  const sessionId = getFirstParam(params.sessionId) as SessionId | null;

  const {
    game,
    frames,
    isAuthenticated,
    isLoading,
    createGame,
    updateGame,
    replaceFramesForGame,
  } = useGameEditor(gameId);
  const { scoreboardLayout } = usePreferences();

  const [date, setDate] = useState('');
  const [frameDrafts, setFrameDrafts] = useState<FrameDraft[]>(EMPTY_FRAMES);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [activeField, setActiveField] = useState<RollField>('roll1Mask');
  const [inputError, setInputError] = useState<string | null>(null);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [didHydrate, setDidHydrate] = useState(false);
  const [draftGameId, setDraftGameId] = useState<GameId | null>(gameId);

  const isAutosaveInFlightRef = useRef(false);
  const hasQueuedAutosaveRef = useRef(false);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const saveSequenceRef = useRef(0);

  const screenTitle = useMemo(
    () => (isCreateMode ? 'Add Game' : 'Edit Game'),
    [isCreateMode]
  );

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
  const tenthFrameHint = getTenthFrameHint(
    activeFrameIndex,
    activeFrame,
    activeField
  );
  const autosaveMessage = useMemo(() => {
    if (!isAuthenticated) {
      return 'Sign in to auto-save changes.';
    }

    if (autosaveState === 'saving') {
      return 'Saving...';
    }

    if (autosaveState === 'error') {
      return autosaveError ?? 'Auto-save failed. Keep editing to retry.';
    }

    return '';
  }, [autosaveError, autosaveState, isAuthenticated]);

  const moveCursor = ({ frameIndex, field }: CursorTarget) => {
    setActiveFrameIndex(frameIndex);
    setActiveField(field);
  };

  useEffect(() => {
    navigation.setOptions({ title: screenTitle });
  }, [navigation, screenTitle]);

  useEffect(() => {
    if (didHydrate) {
      return;
    }

    if (isCreateMode) {
      setDate(new Date().toISOString().slice(0, 10));
      setActiveFrameIndex(0);
      setActiveField('roll1Mask');
      setDraftGameId(null);
      setDidHydrate(true);
      return;
    }

    if (!game || frames === undefined) {
      return;
    }

    const hydratedDrafts = toFrameDrafts(frames);
    const { drafts: nextDrafts } = sanitizeFrameDraftsForEntry(hydratedDrafts);
    const suggestedFrameIndex = findSuggestedFrameIndex(nextDrafts);
    const suggestedField = getPreferredRollField(
      suggestedFrameIndex,
      nextDrafts[suggestedFrameIndex] ?? EMPTY_FRAMES[0]
    );

    setDate(normalizeDateValue(game.date));
    setFrameDrafts(nextDrafts);
    setActiveFrameIndex(suggestedFrameIndex);
    setActiveField(suggestedField);
    setDraftGameId(gameId);
    setDidHydrate(true);
  }, [didHydrate, frames, game, gameId, isCreateMode]);

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

      return {
        ...frame,
        [activeField]: nextMask,
      };
    });
  };

  const commitActiveRoll = (nextMask: number) => {
    let committedFrame: FrameDraft | null = null;

    updateActiveFrame((frame) => {
      const nextFrame = {
        ...frame,
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
          setInputError(
            `Frame ${activeFrameIndex + 1}: roll 1 + roll 2 cannot exceed 10.`
          );
          return frame;
        }

        if (
          activeFrameIndex === 9 &&
          roll1 !== null &&
          roll2 !== null &&
          roll1 < 10 &&
          roll1 + roll2 > 10
        ) {
          setInputError(
            'Frame 10: roll 1 + roll 2 cannot exceed 10 unless roll 1 is a strike.'
          );
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

  useEffect(() => {
    if (!didHydrate) {
      return;
    }

    const persist = async () => {
      if (isAutosaveInFlightRef.current) {
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

      const { trimmedDate, payloadFrames, signature } = autosavePlan;

      if (signature === lastSavedSignatureRef.current) {
        setAutosaveState('saved');
        return;
      }

      isAutosaveInFlightRef.current = true;
      setAutosaveState('saving');
      setAutosaveError(null);
      const saveSequence = saveSequenceRef.current + 1;
      saveSequenceRef.current = saveSequence;

      try {
        let nextGameId = activeGameId;

        if (isCreateMode) {
          if (!sessionId) {
            throw new Error('Session is required when creating a game.');
          }

          if (!nextGameId) {
            nextGameId = await createGame({ sessionId, date: trimmedDate });
            setDraftGameId(nextGameId);
          } else {
            await updateGame({ gameId: nextGameId, date: trimmedDate });
          }
        } else {
          if (!nextGameId) {
            throw new Error('Game not found.');
          }

          await updateGame({ gameId: nextGameId, date: trimmedDate });
        }

        if (!nextGameId) {
          throw new Error('Game not found.');
        }

        await replaceFramesForGame({
          gameId: nextGameId,
          frames: payloadFrames,
        });

        lastSavedSignatureRef.current = JSON.stringify({
          gameId: nextGameId,
          date: trimmedDate,
          frames: payloadFrames,
        });

        if (saveSequenceRef.current === saveSequence) {
          setAutosaveState('saved');
          setAutosaveError(null);
        }
      } catch (caught) {
        if (saveSequenceRef.current === saveSequence) {
          setAutosaveState('error');
          setAutosaveError(
            caught instanceof Error ? caught.message : 'Unable to save game.'
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
    date,
    didHydrate,
    draftGameId,
    frameDrafts,
    isAuthenticated,
    isCreateMode,
    replaceFramesForGame,
    sessionId,
    updateGame,
  ]);

  if (!isCreateMode && isLoading && !didHydrate) {
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

        <ActiveFrameCard
          activeRollMask={activeRollMask}
          activeStandingMask={activeStandingMask}
          autosaveMessage={autosaveMessage}
          autosaveState={autosaveState}
          inlineError={inlineError}
          tenthFrameHint={tenthFrameHint}
          onTogglePin={onTogglePin}
        />
      </View>

      <View style={styles.actionsFooter}>
        <View style={styles.actionsRow}>
          <View style={styles.stickyActionButton}>
            <Pressable
              onPress={onSetFullRack}
              style={({ pressed }) => [
                styles.strikeButton,
                pressed ? styles.strikeButtonPressed : null,
              ]}
            >
              <Text style={styles.strikeButtonLabel}>{shortcutLabel}</Text>
            </Pressable>
          </View>
          <View style={styles.stickyActionButton}>
            <Button label="Next" onPress={onCommitRoll} />
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
    paddingVertical: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stickyActionButton: {
    flex: 1,
  },
  strikeButton: {
    height: 40,
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
