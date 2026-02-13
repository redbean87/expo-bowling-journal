import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { EditableFrameInput, GameId, SessionId } from '@/services/journal';

import { Button, Card, Input } from '@/components/ui';
import { useGameEditor } from '@/hooks/journal';
import { colors, lineHeight, radius, spacing, typeScale } from '@/theme/tokens';

type FrameDraft = {
  roll1: string;
  roll2: string;
  roll3: string;
};

const EMPTY_FRAME_DRAFT: FrameDraft = {
  roll1: '',
  roll2: '',
  roll3: '',
};

const EMPTY_FRAMES: FrameDraft[] = Array.from({ length: 10 }, () => ({
  ...EMPTY_FRAME_DRAFT,
}));

function getFirstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeDateValue(value: string) {
  return value.slice(0, 10);
}

function toFrameDrafts(
  frames: Array<{
    frameNumber: number;
    roll1: number;
    roll2?: number | null;
    roll3?: number | null;
  }>
): FrameDraft[] {
  const drafts = Array.from({ length: 10 }, () => ({ ...EMPTY_FRAME_DRAFT }));

  for (const frame of frames) {
    const index = frame.frameNumber - 1;

    if (index < 0 || index >= drafts.length) {
      continue;
    }

    drafts[index] = {
      roll1: String(frame.roll1),
      roll2:
        frame.roll2 === null || frame.roll2 === undefined
          ? ''
          : String(frame.roll2),
      roll3:
        frame.roll3 === null || frame.roll3 === undefined
          ? ''
          : String(frame.roll3),
    };
  }

  return drafts;
}

function parseOptionalRoll(value: string) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
    throw new Error('Rolls must be integers between 0 and 10.');
  }

  return parsed;
}

function buildFramesPayload(frameDrafts: FrameDraft[]): EditableFrameInput[] {
  const frames: EditableFrameInput[] = [];
  let reachedEnd = false;

  for (const [index, frame] of frameDrafts.entries()) {
    const frameNumber = index + 1;
    const roll1 = frame.roll1.trim();
    const roll2 = frame.roll2.trim();
    const roll3 = frame.roll3.trim();
    const hasAnyValue =
      roll1.length > 0 || roll2.length > 0 || roll3.length > 0;

    if (!hasAnyValue) {
      reachedEnd = true;
      continue;
    }

    if (reachedEnd) {
      throw new Error('Frames must be entered in order with no gaps.');
    }

    if (roll1.length === 0) {
      throw new Error(`Frame ${frameNumber}: roll1 is required.`);
    }

    frames.push({
      frameNumber,
      roll1: parseOptionalRoll(roll1) ?? 0,
      roll2: parseOptionalRoll(roll2),
      roll3: parseOptionalRoll(roll3),
    });
  }

  return frames;
}

export default function GameEditorScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    leagueId?: string | string[];
    gameId?: string | string[];
    sessionId?: string | string[];
  }>();

  const leagueId = getFirstParam(params.leagueId);
  const gameIdParam = getFirstParam(params.gameId);
  const isCreateMode = gameIdParam === 'new';
  const gameId = isCreateMode ? null : (gameIdParam as GameId | null);
  const sessionId = getFirstParam(params.sessionId) as SessionId | null;

  const {
    game,
    frames,
    isAuthenticated,
    isLoading,
    isSaving,
    createGame,
    updateGame,
    replaceFramesForGame,
  } = useGameEditor(gameId);

  const [date, setDate] = useState('');
  const [frameDrafts, setFrameDrafts] = useState<FrameDraft[]>(EMPTY_FRAMES);
  const [error, setError] = useState<string | null>(null);
  const [didHydrate, setDidHydrate] = useState(false);

  const screenTitle = useMemo(
    () => (isCreateMode ? 'Add Game' : 'Edit Game'),
    [isCreateMode]
  );

  useEffect(() => {
    navigation.setOptions({ title: screenTitle });
  }, [navigation, screenTitle]);

  useEffect(() => {
    if (didHydrate) {
      return;
    }

    if (isCreateMode) {
      setDate(new Date().toISOString().slice(0, 10));
      setDidHydrate(true);
      return;
    }

    if (!game) {
      return;
    }

    if (frames === undefined) {
      return;
    }

    setDate(normalizeDateValue(game.date));
    setFrameDrafts(toFrameDrafts(frames));
    setDidHydrate(true);
  }, [didHydrate, frames, game, isCreateMode]);

  const updateFrameDraft = (
    frameIndex: number,
    field: keyof FrameDraft,
    value: string
  ) => {
    setFrameDrafts((current) => {
      const next = [...current];
      next[frameIndex] = {
        ...next[frameIndex],
        [field]: value,
      };
      return next;
    });
  };

  const onSave = async () => {
    setError(null);

    if (!isAuthenticated) {
      setError('Sign in to save games.');
      return;
    }

    if (!isCreateMode && !didHydrate) {
      setError('Game is still loading. Please wait a moment and try again.');
      return;
    }

    const trimmedDate = date.trim();

    if (trimmedDate.length === 0) {
      setError('Date is required.');
      return;
    }

    let nextGameId = gameId;

    try {
      const payloadFrames = buildFramesPayload(frameDrafts);

      if (isCreateMode) {
        if (!sessionId) {
          throw new Error('Session is required when creating a game.');
        }

        nextGameId = await createGame({
          sessionId,
          date: trimmedDate,
        });
      } else {
        if (!nextGameId) {
          throw new Error('Game not found.');
        }

        await updateGame({
          gameId: nextGameId,
          date: trimmedDate,
        });
      }

      if (!nextGameId) {
        throw new Error('Game not found.');
      }

      await replaceFramesForGame({
        gameId: nextGameId,
        frames: payloadFrames,
      });

      if (navigation.canGoBack()) {
        router.back();
        return;
      }

      if (leagueId && sessionId) {
        router.replace({
          pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
          params: {
            leagueId,
            sessionId,
          } as never,
        } as never);
        return;
      }

      router.replace('/journal');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to save game.'
      );
    }
  };

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
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.sectionTitle}>Game details</Text>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            value={date}
          />
          <Text style={styles.helpText}>
            Save partial games by filling only the frames bowled so far.
          </Text>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Frames</Text>
          {frameDrafts.map((frame, index) => (
            <View key={`frame-${index + 1}`} style={styles.frameRow}>
              <Text style={styles.frameLabel}>Frame {index + 1}</Text>
              <View style={styles.rollsRow}>
                <Input
                  keyboardType="number-pad"
                  onChangeText={(value) =>
                    updateFrameDraft(index, 'roll1', value)
                  }
                  placeholder="R1"
                  style={styles.rollInput}
                  value={frame.roll1}
                />
                <Input
                  keyboardType="number-pad"
                  onChangeText={(value) =>
                    updateFrameDraft(index, 'roll2', value)
                  }
                  placeholder="R2"
                  style={styles.rollInput}
                  value={frame.roll2}
                />
                <Input
                  keyboardType="number-pad"
                  onChangeText={(value) =>
                    updateFrameDraft(index, 'roll3', value)
                  }
                  placeholder="R3"
                  style={styles.rollInput}
                  value={frame.roll3}
                />
              </View>
            </View>
          ))}
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          disabled={isSaving || (!isCreateMode && !didHydrate)}
          label={isSaving ? 'Saving...' : 'Save game'}
          onPress={onSave}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: typeScale.titleSm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  helpText: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
  frameRow: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSubtle,
  },
  frameLabel: {
    fontSize: typeScale.bodySm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rollsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rollInput: {
    flex: 1,
    height: 40,
  },
  error: {
    color: colors.danger,
    fontSize: typeScale.bodySm,
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
