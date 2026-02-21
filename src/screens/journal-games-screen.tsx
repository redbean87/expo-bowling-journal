import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  formatGameSequenceLabel,
  resolveGameEntryGameId,
  toOldestFirstGames,
} from './journal-fast-lane-utils';
import { buildSessionNightSummary } from './journal-games-night-summary';

import type { GameId, LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Card, FloatingActionButton } from '@/components/ui';
import { useGames, useLeagues } from '@/hooks/journal';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

function getFirstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

type PreviewItem = {
  text: string;
  hasSplit: boolean;
};

type PreviewMarkSummary = {
  strikeMarks: number;
  spareMarks: number;
  openFrames: number;
};

function normalizeFramePreviewItems(framePreview: unknown): PreviewItem[] {
  if (!Array.isArray(framePreview)) {
    return [];
  }

  return framePreview
    .map((item) => {
      if (typeof item === 'string') {
        return {
          text: item,
          hasSplit: false,
        } satisfies PreviewItem;
      }

      if (
        item !== null &&
        typeof item === 'object' &&
        'text' in item &&
        typeof item.text === 'string'
      ) {
        return {
          text: item.text,
          hasSplit: 'hasSplit' in item ? Boolean(item.hasSplit) : false,
        } satisfies PreviewItem;
      }

      return null;
    })
    .filter((item): item is PreviewItem => item !== null);
}

function summarizePreviewMarks(
  framePreviewItems: PreviewItem[]
): PreviewMarkSummary {
  let strikeMarks = 0;
  let spareMarks = 0;
  let openFrames = 0;

  for (const item of framePreviewItems) {
    const frameText = item.text;
    const compactFrameText = frameText.replace(/\s+/g, '');

    strikeMarks += [...frameText].filter(
      (character) => character === 'X'
    ).length;
    spareMarks += [...frameText].filter(
      (character) => character === '/'
    ).length;

    if (compactFrameText === '' || compactFrameText === '-') {
      continue;
    }

    if (compactFrameText.includes('X') || compactFrameText.includes('/')) {
      continue;
    }

    if (compactFrameText.length >= 2) {
      openFrames += 1;
    }
  }

  return {
    strikeMarks,
    spareMarks,
    openFrames,
  };
}

function createDraftNonce() {
  const timestampPart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${timestampPart}-${randomPart}`;
}

export default function JournalGamesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    leagueId?: string | string[];
    sessionId?: string | string[];
    startEntry?: string | string[];
  }>();
  const leagueId = getFirstParam(params.leagueId) as LeagueId | null;
  const sessionId = getFirstParam(params.sessionId) as SessionId | null;
  const startEntry = getFirstParam(params.startEntry) === '1';
  const { games, removeGame, isLoading: isGamesLoading } = useGames(sessionId);
  const { leagues } = useLeagues();
  const [gameActionError, setGameActionError] = useState<string | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const hasHandledStartEntryRef = useRef(false);

  const league = useMemo(() => {
    if (!leagueId) {
      return null;
    }

    return leagues.find((candidate) => candidate._id === leagueId) ?? null;
  }, [leagueId, leagues]);

  const nightSummary = useMemo(
    () => buildSessionNightSummary(games, league?.gamesPerSession),
    [games, league?.gamesPerSession]
  );
  const displayGames = useMemo(() => toOldestFirstGames(games), [games]);

  const openGameEditor = (gameId: string) => {
    router.push({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
      params: {
        leagueId: leagueId ?? '',
        sessionId: sessionId ?? '',
        gameId,
      },
    });
  };

  const confirmDeleteGame = async (label: string) => {
    const message = `Delete ${label} and all frame entries?`;

    if (Platform.OS === 'web') {
      return globalThis.confirm(message);
    }

    return await new Promise<boolean>((resolve) => {
      Alert.alert('Delete game?', message, [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ]);
    });
  };

  const onDeleteGame = async (gameId: string, label: string) => {
    setGameActionError(null);
    const isConfirmed = await confirmDeleteGame(label);

    if (!isConfirmed) {
      return;
    }

    setDeletingGameId(gameId);

    try {
      await removeGame({ gameId: gameId as GameId });
    } catch (caught) {
      setGameActionError(
        caught instanceof Error ? caught.message : 'Unable to delete game.'
      );
    } finally {
      setDeletingGameId(null);
    }
  };

  useEffect(() => {
    if (!startEntry || hasHandledStartEntryRef.current) {
      return;
    }

    if (!leagueId || !sessionId || isGamesLoading) {
      return;
    }

    hasHandledStartEntryRef.current = true;
    const gameId = resolveGameEntryGameId(games);

    router.replace({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
      params: {
        leagueId,
        sessionId,
        gameId,
      },
    });
  }, [games, isGamesLoading, leagueId, router, sessionId, startEntry]);

  return (
    <ScreenLayout
      title="Games"
      subtitle="Review games for this session, then add or edit frame data."
      fillCard
      hideHeader
      compact
      chromeless
    >
      <View style={styles.screenBody}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {gameActionError ? (
            <Text style={styles.errorText}>{gameActionError}</Text>
          ) : null}

          {sessionId ? (
            <Card muted>
              <Text style={styles.summaryTitle}>Night stats</Text>
              <Text style={styles.meta}>
                {nightSummary.targetGames === null
                  ? `Games: ${String(nightSummary.gamesPlayed)}`
                  : `Games: ${String(nightSummary.gamesPlayed)} / ${String(nightSummary.targetGames)}`}
              </Text>
              {nightSummary.gamesPlayed > 0 ? (
                <>
                  <Text style={styles.meta}>
                    Series: {nightSummary.totalPins}
                  </Text>
                  <Text style={styles.meta}>
                    Average: {nightSummary.average.toFixed(2)}
                  </Text>
                  <Text style={styles.meta}>
                    High game: {nightSummary.highGame ?? '-'}
                  </Text>
                  <Text style={styles.meta}>
                    Low game: {nightSummary.lowGame ?? '-'}
                  </Text>
                  <Text style={styles.meta}>
                    Strikes {nightSummary.strikes} | Spares{' '}
                    {nightSummary.spares} | Opens {nightSummary.opens}
                  </Text>
                </>
              ) : null}
            </Card>
          ) : null}

          {isGamesLoading ? (
            <Text style={styles.meta}>Loading games...</Text>
          ) : null}
          {!isGamesLoading && !sessionId ? (
            <Text style={styles.meta}>Session not found.</Text>
          ) : null}
          {!isGamesLoading && sessionId && games.length === 0 ? (
            <Text style={styles.meta}>No games in this session yet.</Text>
          ) : null}

          {displayGames.map((game, index) => {
            const framePreviewItems = normalizeFramePreviewItems(
              game.framePreview
            );
            const previewRowOne = framePreviewItems.slice(0, 5);
            const previewRowTwo = framePreviewItems.slice(5, 10);
            const previewMarkSummary = summarizePreviewMarks(framePreviewItems);
            const gameLabel = formatGameSequenceLabel(index + 1);

            return (
              <Card key={game._id} style={styles.rowCard}>
                <Pressable
                  style={({ pressed }) => [pressed ? styles.rowPressed : null]}
                  onPress={() => openGameEditor(game._id)}
                >
                  <Text style={styles.rowTitle}>
                    {gameLabel} - {game.totalScore}
                  </Text>
                  <Text style={styles.meta}>
                    {framePreviewItems.length > 0
                      ? `Strikes ${String(previewMarkSummary.strikeMarks)} | Spares ${String(previewMarkSummary.spareMarks)} | Opens ${String(previewMarkSummary.openFrames)}`
                      : `Strikes ${String(game.strikes)} | Spares ${String(game.spares)} | Opens ${String(game.opens)}`}
                  </Text>
                  {framePreviewItems.length > 0 ? (
                    <View style={styles.previewGrid}>
                      <View style={styles.previewRow}>
                        {previewRowOne.map((item, itemIndex) => (
                          <View
                            key={`${game._id}-row-1-${String(itemIndex)}`}
                            style={[
                              styles.previewChip,
                              item.hasSplit ? styles.previewChipSplit : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.previewChipText,
                                item.hasSplit
                                  ? styles.previewChipTextSplit
                                  : null,
                              ]}
                            >
                              {item.text}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.previewRow}>
                        {previewRowTwo.map((item, itemIndex) => (
                          <View
                            key={`${game._id}-row-2-${String(itemIndex)}`}
                            style={[
                              styles.previewChip,
                              item.hasSplit ? styles.previewChipSplit : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.previewChipText,
                                item.hasSplit
                                  ? styles.previewChipTextSplit
                                  : null,
                              ]}
                            >
                              {item.text}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.previewUnavailableText}>
                      Frame-by-frame preview unavailable
                    </Text>
                  )}
                </Pressable>

                <View style={styles.rowActions}>
                  <Pressable
                    disabled={deletingGameId === game._id}
                    onPress={() => void onDeleteGame(game._id, gameLabel)}
                    style={({ pressed }) => [
                      styles.linkAction,
                      pressed ? styles.linkActionPressed : null,
                    ]}
                  >
                    <Text style={styles.deleteLabel}>
                      {deletingGameId === game._id ? 'Deleting...' : 'Delete'}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}
        </ScrollView>

        <FloatingActionButton
          accessibilityLabel="Add game"
          disabled={!leagueId || !sessionId}
          onPress={() =>
            router.push({
              pathname:
                '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
              params: {
                leagueId: leagueId ?? '',
                sessionId: sessionId ?? '',
                gameId: 'new',
                draftNonce: createDraftNonce(),
              },
            })
          }
        />
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl + 72,
  },
  screenBody: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  rowTitle: {
    fontSize: typeScale.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowPressed: {
    opacity: 0.82,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 2,
  },
  linkAction: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
  },
  linkActionPressed: {
    opacity: 0.75,
  },
  deleteLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.danger,
  },
  errorText: {
    fontSize: typeScale.bodySm,
    color: colors.danger,
  },
  meta: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
  summaryTitle: {
    fontSize: typeScale.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  previewGrid: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  previewChip: {
    flex: 1,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
  },
  previewChipSplit: {
    borderColor: '#E8C5C2',
    backgroundColor: '#FEF5F4',
  },
  previewChipText: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  previewChipTextSplit: {
    color: colors.danger,
  },
  previewUnavailableText: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
  rowCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    gap: spacing.xs,
  },
});
