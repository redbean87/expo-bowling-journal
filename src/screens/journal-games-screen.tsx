import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { removeLocalGameDraft } from './game-editor/game-local-draft-storage';
import {
  removeQueuedGameSaveEntry,
  type QueuedGameSaveEntry,
} from './game-editor/game-save-queue';
import {
  loadGameSaveQueue,
  persistGameSaveQueue,
} from './game-editor/game-save-queue-storage';
import { GameActionsModal } from './journal/components/game-actions-modal';
import { GameRowCard } from './journal/components/game-row-card';
import { openJournalNativeActionSheet } from './journal/journal-action-sheet';
import {
  loadJournalClientSyncMap,
  type JournalClientSyncMap,
} from './journal/journal-client-sync-map-storage';
import {
  type QueuedLeagueCreateEntry,
  type QueuedSessionCreateEntry,
} from './journal/journal-create-queue';
import { loadJournalCreateQueue } from './journal/journal-create-queue-storage';
import {
  areQueueEntriesEqual,
  buildDisplayGamesForScreen,
  buildDisplayNightSummary,
  buildQueueDerivedGame,
  buildStartEntryTarget,
  type PendingHandoffEntry,
} from './journal/journal-games-display';
import {
  buildJournalGameEditorRouteParams,
  buildJournalGamesRouteParams,
  getFirstParam,
  resolveJournalRouteIds,
} from './journal/journal-route-params';
import {
  formatIsoDateLabel,
  formatGameSequenceLabel,
  formatSessionWeekLabel,
} from './journal-fast-lane-utils';

import type { GameId, LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Card, FloatingActionButton } from '@/components/ui';
import { useGames, useLeagues, useSessions } from '@/hooks/journal';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { createDraftNonce } from '@/utils/draft-nonce';

type QueuedSessionContext = {
  date: string | null;
  weekNumber: number | null;
};

type GameActionTarget = {
  gameId: string | null;
  queueId: string | null;
  label: string;
  title: string;
};

export default function JournalGamesScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    leagueId?: string | string[];
    leagueClientSyncId?: string | string[];
    sessionId?: string | string[];
    sessionClientSyncId?: string | string[];
    sessionDate?: string | string[];
    sessionWeekNumber?: string | string[];
    startEntry?: string | string[];
  }>();
  const rawLeagueId = getFirstParam(params.leagueId);
  const leagueClientSyncIdParam = getFirstParam(params.leagueClientSyncId);
  const leagueClientSyncId =
    leagueClientSyncIdParam ??
    (rawLeagueId?.startsWith('draft-') ? rawLeagueId.slice(6) : null);
  const rawSessionId = getFirstParam(params.sessionId);
  const sessionClientSyncIdParam = getFirstParam(params.sessionClientSyncId);
  const sessionClientSyncId =
    sessionClientSyncIdParam ??
    (rawSessionId?.startsWith('draft-') ? rawSessionId.slice(6) : null);
  const leagueId =
    rawLeagueId && !rawLeagueId.startsWith('draft-')
      ? (rawLeagueId as LeagueId)
      : null;
  const sessionId =
    rawSessionId && !rawSessionId.startsWith('draft-')
      ? (rawSessionId as SessionId)
      : null;
  const startEntry = getFirstParam(params.startEntry) === '1';
  const fallbackSessionDate = getFirstParam(params.sessionDate);
  const fallbackSessionWeekNumberValue = getFirstParam(
    params.sessionWeekNumber
  );
  const fallbackSessionWeekNumber =
    fallbackSessionWeekNumberValue === null
      ? null
      : Number.parseInt(fallbackSessionWeekNumberValue, 10);
  const canCreateGameTarget = Boolean(
    (leagueId || leagueClientSyncId) && (sessionId || sessionClientSyncId)
  );
  const { games, removeGame, isLoading: isGamesLoading } = useGames(sessionId);
  const { leagues } = useLeagues();
  const { sessions } = useSessions(leagueId);
  const [queuedSessionEntries, setQueuedSessionEntries] = useState<
    QueuedGameSaveEntry[]
  >([]);
  const [pendingHandoffEntries, setPendingHandoffEntries] = useState<
    PendingHandoffEntry[]
  >([]);
  const [gameActionError, setGameActionError] = useState<string | null>(null);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const [isGameActionsVisible, setIsGameActionsVisible] = useState(false);
  const [gameActionTarget, setGameActionTarget] =
    useState<GameActionTarget | null>(null);
  const [syncMap, setSyncMap] = useState<JournalClientSyncMap>({
    leagues: {},
    sessions: {},
    houses: {},
    patterns: {},
    balls: {},
  });
  const [queuedSessionContext, setQueuedSessionContext] =
    useState<QueuedSessionContext>({
      date: null,
      weekNumber: null,
    });
  const [draftLeagueName, setDraftLeagueName] = useState<string | null>(null);
  const syncedHandoffByQueueIdRef = useRef(new Map<string, string>());
  const stableCreatedAtByGameIdRef = useRef(new Map<string, number>());
  const queuedSessionEntriesRef = useRef<QueuedGameSaveEntry[]>([]);
  const hasHandledStartEntryRef = useRef(false);
  const isRefreshingQueueRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const refreshSyncMap = async () => {
      const nextSyncMap = await loadJournalClientSyncMap();

      if (isMounted) {
        setSyncMap(nextSyncMap);
      }
    };

    void refreshSyncMap();
    const interval = setInterval(() => {
      void refreshSyncMap();
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const refreshQueuedSessionContext = async () => {
      if (!leagueClientSyncId && !sessionClientSyncId) {
        if (isMounted) {
          setDraftLeagueName(null);
          setQueuedSessionContext({ date: null, weekNumber: null });
        }

        return;
      }

      const queueEntries = await loadJournalCreateQueue();

      if (leagueClientSyncId) {
        const queuedLeague = queueEntries.find(
          (entry): entry is QueuedLeagueCreateEntry =>
            entry.entityType === 'league-create' &&
            entry.clientSyncId === leagueClientSyncId
        );

        if (isMounted) {
          setDraftLeagueName(queuedLeague?.payload.name ?? null);
        }
      } else if (isMounted) {
        setDraftLeagueName(null);
      }

      if (!sessionClientSyncId) {
        if (isMounted) {
          setQueuedSessionContext({ date: null, weekNumber: null });
        }

        return;
      }

      const queuedSessionEntry = queueEntries.find(
        (entry): entry is QueuedSessionCreateEntry =>
          entry.entityType === 'session-create' &&
          entry.clientSyncId === sessionClientSyncId
      );

      if (!queuedSessionEntry) {
        return;
      }

      const nextContext: QueuedSessionContext = {
        date: queuedSessionEntry.payload.date,
        weekNumber: queuedSessionEntry.payload.weekNumber ?? null,
      };

      if (isMounted) {
        setQueuedSessionContext((current) => {
          if (
            current.date === nextContext.date &&
            current.weekNumber === nextContext.weekNumber
          ) {
            return current;
          }

          return nextContext;
        });
      }
    };

    void refreshQueuedSessionContext();
    const interval = setInterval(() => {
      void refreshQueuedSessionContext();
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [leagueClientSyncId, sessionClientSyncId]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const mappedLeagueId =
      !leagueId && leagueClientSyncId
        ? syncMap.leagues[leagueClientSyncId]
        : leagueId;
    const mappedSessionId =
      !sessionId && sessionClientSyncId
        ? syncMap.sessions[sessionClientSyncId]
        : sessionId;

    if (!mappedLeagueId || !mappedSessionId) {
      return;
    }

    if (leagueId === mappedLeagueId && sessionId === mappedSessionId) {
      return;
    }

    router.replace({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
      params: buildJournalGamesRouteParams({
        leagueId: mappedLeagueId,
        sessionId: mappedSessionId,
        leagueClientSyncId,
        sessionClientSyncId,
        sessionDate: fallbackSessionDate,
        sessionWeekNumber: Number.isFinite(fallbackSessionWeekNumber)
          ? fallbackSessionWeekNumber
          : null,
      }) as never,
    } as never);
  }, [
    fallbackSessionDate,
    fallbackSessionWeekNumber,
    isFocused,
    leagueClientSyncId,
    leagueId,
    router,
    sessionClientSyncId,
    sessionId,
    syncMap,
  ]);

  const refreshQueuedEntries = useCallback(async () => {
    if (isRefreshingQueueRef.current) {
      return;
    }

    isRefreshingQueueRef.current = true;

    const activeSessionKey = sessionId ?? rawSessionId;

    if (!activeSessionKey && !sessionClientSyncId) {
      setQueuedSessionEntries([]);
      setPendingHandoffEntries([]);
      queuedSessionEntriesRef.current = [];
      isRefreshingQueueRef.current = false;
      return;
    }

    try {
      const queueEntries = await loadGameSaveQueue();
      const nextQueuedEntries = queueEntries.filter(
        (entry) =>
          entry.sessionId === activeSessionKey ||
          (sessionClientSyncId !== null &&
            entry.sessionClientSyncId === sessionClientSyncId)
      );
      const now = Date.now();
      const currentQueuedEntries = queuedSessionEntriesRef.current;
      const nextQueuedIds = new Set(
        nextQueuedEntries.map((entry) => entry.queueId)
      );
      const serverGameIds = new Set(games.map((game) => String(game._id)));

      setPendingHandoffEntries((currentPendingEntries) => {
        const pendingByQueueId = new Map(
          currentPendingEntries.map((entry) => [
            entry.queuedGame.queueId,
            entry,
          ])
        );

        for (const previousEntry of currentQueuedEntries) {
          if (nextQueuedIds.has(previousEntry.queueId)) {
            continue;
          }

          if (previousEntry.gameId !== null) {
            continue;
          }

          if (deletingGameId === previousEntry.queueId) {
            continue;
          }

          if (pendingByQueueId.has(previousEntry.queueId)) {
            continue;
          }

          pendingByQueueId.set(previousEntry.queueId, {
            queuedGame: buildQueueDerivedGame(previousEntry),
            expiresAt: now + 10_000,
          });
        }

        const nextPendingEntries = [...pendingByQueueId.values()].filter(
          (entry) => {
            if (entry.expiresAt <= now) {
              return false;
            }

            if (nextQueuedIds.has(entry.queuedGame.queueId)) {
              return false;
            }

            const mappedServerId = syncedHandoffByQueueIdRef.current.get(
              entry.queuedGame.queueId
            );

            if (mappedServerId && serverGameIds.has(mappedServerId)) {
              return false;
            }

            return true;
          }
        );

        if (nextPendingEntries.length === currentPendingEntries.length) {
          const unchanged = nextPendingEntries.every((entry, index) => {
            const current = currentPendingEntries[index];

            return (
              current?.queuedGame.queueId === entry.queuedGame.queueId &&
              current.expiresAt === entry.expiresAt
            );
          });

          if (unchanged) {
            return currentPendingEntries;
          }
        }

        return nextPendingEntries;
      });

      setQueuedSessionEntries((currentQueuedEntries) => {
        if (areQueueEntriesEqual(currentQueuedEntries, nextQueuedEntries)) {
          return currentQueuedEntries;
        }

        return nextQueuedEntries;
      });
      queuedSessionEntriesRef.current = nextQueuedEntries;
    } finally {
      isRefreshingQueueRef.current = false;
    }
  }, [deletingGameId, games, rawSessionId, sessionClientSyncId, sessionId]);

  useEffect(() => {
    queuedSessionEntriesRef.current = queuedSessionEntries;
  }, [queuedSessionEntries]);

  useEffect(() => {
    void refreshQueuedEntries();
  }, [refreshQueuedEntries]);

  useFocusEffect(
    useCallback(() => {
      void refreshQueuedEntries();

      const intervalId = setInterval(() => {
        void refreshQueuedEntries();
      }, 1000);

      return () => {
        clearInterval(intervalId);
      };
    }, [refreshQueuedEntries])
  );

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

  const leagueName = selectedLeague?.name ?? draftLeagueName;

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

  useEffect(() => {
    const sessionWeek = selectedSession
      ? (selectedSession.weekNumber ??
        derivedWeekNumberBySessionId.get(selectedSession._id) ??
        null)
      : Number.isFinite(fallbackSessionWeekNumber)
        ? fallbackSessionWeekNumber
        : queuedSessionContext.weekNumber;
    const sessionDate = selectedSession
      ? formatIsoDateLabel(selectedSession.date)
      : fallbackSessionDate
        ? formatIsoDateLabel(fallbackSessionDate)
        : queuedSessionContext.date
          ? formatIsoDateLabel(queuedSessionContext.date)
          : null;
    const sessionLabel =
      sessionWeek !== null && sessionDate
        ? `${formatSessionWeekLabel(sessionWeek)} · ${sessionDate}`
        : sessionDate;

    if (sessionLabel) {
      navigation.setOptions({
        headerTitle: sessionLabel,
        title: leagueName ?? 'Games',
      });
      return;
    }

    navigation.setOptions({
      headerTitle: 'Games',
      title: 'Games',
    });
  }, [
    derivedWeekNumberBySessionId,
    fallbackSessionDate,
    fallbackSessionWeekNumber,
    leagueName,
    navigation,
    queuedSessionContext.date,
    queuedSessionContext.weekNumber,
    selectedSession,
  ]);

  const displayGames = useMemo(() => {
    return buildDisplayGamesForScreen({
      games,
      queuedSessionEntries,
      pendingHandoffEntries,
      handoffByQueueId: syncedHandoffByQueueIdRef.current,
      stableCreatedAtByGameId: stableCreatedAtByGameIdRef.current,
    });
  }, [games, pendingHandoffEntries, queuedSessionEntries]);

  const nightSummary = useMemo(
    () =>
      buildDisplayNightSummary(displayGames, selectedLeague?.gamesPerSession),
    [displayGames, selectedLeague?.gamesPerSession]
  );

  const openGameEditor = (gameId: string, draftNonce: string | null = null) => {
    const { leagueRouteId, sessionRouteId } = resolveJournalRouteIds({
      leagueId,
      rawLeagueId,
      sessionId,
      rawSessionId,
    });

    if (!leagueRouteId || !sessionRouteId) {
      return;
    }

    router.push({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
      params: buildJournalGameEditorRouteParams({
        leagueId: leagueRouteId,
        sessionId: sessionRouteId,
        leagueClientSyncId,
        sessionClientSyncId,
        gameId,
        draftNonce,
      }),
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

  const onDeleteGame = async ({
    gameId,
    queueId,
    label,
  }: {
    gameId: string | null;
    queueId: string | null;
    label: string;
  }) => {
    setGameActionError(null);
    const isConfirmed = await confirmDeleteGame(label);

    if (!isConfirmed) {
      return;
    }

    setDeletingGameId(gameId ?? queueId);

    try {
      if (gameId) {
        await removeGame({ gameId: gameId as GameId });
      }

      if (queueId) {
        const queueEntries = await loadGameSaveQueue();
        const nextEntries = removeQueuedGameSaveEntry(queueEntries, queueId);
        await persistGameSaveQueue(nextEntries);
        await removeLocalGameDraft(queueId);
        await refreshQueuedEntries();
      }
    } catch (caught) {
      setGameActionError(
        caught instanceof Error ? caught.message : 'Unable to delete game.'
      );
    } finally {
      setDeletingGameId(null);
    }
  };

  const closeGameActions = () => {
    setIsGameActionsVisible(false);
    setGameActionTarget(null);
  };

  const runGameAction = (target: GameActionTarget) => {
    void onDeleteGame({
      gameId: target.gameId,
      queueId: target.queueId,
      label: target.label,
    });
  };

  const openGameActions = (target: GameActionTarget) => {
    const handled = openJournalNativeActionSheet({
      title: target.title,
      actions: [
        {
          label: 'Delete game',
          destructive: true,
          onPress: () => runGameAction(target),
        },
      ],
    });

    if (handled) {
      return;
    }

    setGameActionTarget(target);
    setIsGameActionsVisible(true);
  };

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (!startEntry || hasHandledStartEntryRef.current) {
      return;
    }

    const { leagueRouteId, sessionRouteId } = resolveJournalRouteIds({
      leagueId,
      rawLeagueId,
      sessionId,
      rawSessionId,
    });

    if (!leagueRouteId || !sessionRouteId || isGamesLoading) {
      return;
    }

    hasHandledStartEntryRef.current = true;
    const startEntryTarget = buildStartEntryTarget(displayGames);

    router.replace({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
      params: buildJournalGameEditorRouteParams({
        leagueId: leagueRouteId,
        sessionId: sessionRouteId,
        leagueClientSyncId,
        sessionClientSyncId,
        gameId: startEntryTarget.gameId,
        draftNonce: startEntryTarget.draftNonce,
      }),
    });
  }, [
    displayGames,
    isFocused,
    isGamesLoading,
    leagueClientSyncId,
    leagueId,
    rawLeagueId,
    rawSessionId,
    router,
    sessionClientSyncId,
    sessionId,
    startEntry,
  ]);

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
            <Card muted style={styles.summaryCard}>
              <View style={styles.summaryHeaderRow}>
                <Text style={styles.summaryTitle}>Night stats</Text>
                <Text style={[styles.meta, styles.summaryValueText]}>
                  {nightSummary.targetGames === null
                    ? `Games: ${String(nightSummary.gamesPlayed)}`
                    : `Games: ${String(nightSummary.gamesPlayed)} / ${String(nightSummary.targetGames)}`}
                </Text>
              </View>
              {nightSummary.gamesPlayed > 0 ? (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={styles.meta}>
                      Series: {nightSummary.totalPins}
                    </Text>
                    <Text style={[styles.meta, styles.summaryValueText]}>
                      Average: {nightSummary.average.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.meta}>
                      High game: {nightSummary.highGame ?? '-'}
                    </Text>
                    <Text style={[styles.meta, styles.summaryValueText]}>
                      Low game: {nightSummary.lowGame ?? '-'}
                    </Text>
                  </View>
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
          {!isGamesLoading && !sessionId && displayGames.length === 0 ? (
            <Text style={styles.meta}>
              {sessionClientSyncId
                ? 'No games in this session yet. Tap + to add one.'
                : 'Session not found.'}
            </Text>
          ) : null}
          {!isGamesLoading && sessionId && displayGames.length === 0 ? (
            <Text style={styles.meta}>No games in this session yet.</Text>
          ) : null}

          {displayGames.map((game, index) => {
            const gameLabel = formatGameSequenceLabel(index + 1);

            return (
              <GameRowCard
                key={game.key}
                deleteDisabled={
                  deletingGameId === (game.deleteGameId ?? game.key)
                }
                game={game}
                gameLabel={gameLabel}
                onOpenActions={openGameActions}
                onOpenEditor={openGameEditor}
              />
            );
          })}
        </ScrollView>

        <FloatingActionButton
          accessibilityLabel="Add game"
          disabled={!canCreateGameTarget}
          onPress={() =>
            router.push({
              pathname:
                '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
              params: buildJournalGameEditorRouteParams({
                leagueId: leagueId ?? `draft-${leagueClientSyncId ?? 'league'}`,
                sessionId:
                  sessionId ?? `draft-${sessionClientSyncId ?? 'session'}`,
                leagueClientSyncId,
                sessionClientSyncId,
                gameId: 'new',
                draftNonce: createDraftNonce(),
              }),
            })
          }
        />

        <GameActionsModal
          onClose={closeGameActions}
          onDelete={runGameAction}
          target={gameActionTarget}
          visible={isGameActionsVisible}
        />
      </View>
    </ScreenLayout>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    summaryCard: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: 10,
      gap: spacing.xs,
    },
    summaryHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      alignItems: 'center',
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    summaryValueText: {
      textAlign: 'right',
      opacity: 0.9,
    },
  });
