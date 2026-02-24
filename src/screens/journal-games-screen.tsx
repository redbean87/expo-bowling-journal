import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getFrameSplitFlags,
  getFrameSymbolParts,
  getSettledRunningTotals,
  toFrameDrafts,
} from './game-editor/game-editor-frame-utils';
import { removeLocalGameDraft } from './game-editor/game-local-draft-storage';
import {
  removeQueuedGameSaveEntry,
  type QueuedGameSaveEntry,
} from './game-editor/game-save-queue';
import {
  loadGameSaveQueue,
  persistGameSaveQueue,
} from './game-editor/game-save-queue-storage';
import {
  type QueuedLeagueCreateEntry,
  type QueuedSessionCreateEntry,
} from './journal/journal-create-queue';
import { loadJournalCreateQueue } from './journal/journal-create-queue-storage';
import {
  loadJournalClientSyncMap,
  type JournalClientSyncMap,
} from './journal/journal-client-sync-map-storage';
import {
  formatIsoDateLabel,
  formatGameSequenceLabel,
  formatSessionWeekLabel,
  toOldestFirstGames,
} from './journal-fast-lane-utils';
import { normalizeGamesPerSession } from './journal-games-night-summary';
import { reconcileGamesForDisplay } from './journal-games-reconciliation';

import type { GameId, LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Card, FloatingActionButton } from '@/components/ui';
import { useGames, useLeagues, useSessions } from '@/hooks/journal';
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

type DisplayGameItem = {
  key: string;
  date: string;
  routeGameId: string;
  routeDraftNonce: string | null;
  deleteGameId: string | null;
  deleteQueueId: string | null;
  createdAt: number;
  totalScore: number;
  strikes: number;
  spares: number;
  opens: number;
  framePreviewItems: PreviewItem[];
};

type QueueDerivedGame = {
  queueId: string;
  date: string;
  gameId: string | null;
  draftNonce: string | null;
  createdAt: number;
  totalScore: number;
  strikes: number;
  spares: number;
  opens: number;
  framePreviewItems: PreviewItem[];
};

type PendingHandoffEntry = {
  queuedGame: QueueDerivedGame;
  expiresAt: number;
};

type QueuedSessionContext = {
  date: string | null;
  weekNumber: number | null;
};

type StartEntryTarget = {
  gameId: string;
  draftNonce: string | null;
};

type GameActionTarget = {
  gameId: string | null;
  queueId: string | null;
  label: string;
  title: string;
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

function toTotalScoreFromRunningTotals(values: Array<number | null>) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];

    if (value !== null) {
      return value;
    }
  }

  return 0;
}

function buildQueueDerivedGame(entry: QueuedGameSaveEntry): QueueDerivedGame {
  const frameDrafts = toFrameDrafts(entry.frames);
  const framePreviewItems = frameDrafts
    .map((frame, frameIndex) => {
      const text = getFrameSymbolParts(frameIndex, frame).join(' ');
      const splitFlags = getFrameSplitFlags(frameIndex, frame);

      return {
        text,
        hasSplit: splitFlags.roll1 || splitFlags.roll2 || splitFlags.roll3,
      } satisfies PreviewItem;
    })
    .filter((item) => item.text.trim().length > 0);

  const previewMarks = summarizePreviewMarks(framePreviewItems);
  const runningTotals = getSettledRunningTotals(frameDrafts);

  return {
    queueId: entry.queueId,
    date: entry.date,
    gameId: entry.gameId,
    draftNonce: entry.draftNonce,
    createdAt: entry.createdAt,
    totalScore: toTotalScoreFromRunningTotals(runningTotals),
    strikes: previewMarks.strikeMarks,
    spares: previewMarks.spareMarks,
    opens: previewMarks.openFrames,
    framePreviewItems,
  };
}

function areQueueEntriesEqual(
  left: QueuedGameSaveEntry[],
  right: QueuedGameSaveEntry[]
) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort((a, b) =>
    a.queueId.localeCompare(b.queueId)
  );
  const rightSorted = [...right].sort((a, b) =>
    a.queueId.localeCompare(b.queueId)
  );

  return leftSorted.every((entry, index) => {
    const other = rightSorted[index];

    if (!other) {
      return false;
    }

    return (
      entry.queueId === other.queueId &&
      entry.signature === other.signature &&
      entry.gameId === other.gameId &&
      entry.draftNonce === other.draftNonce &&
      entry.nextRetryAt === other.nextRetryAt &&
      entry.updatedAt === other.updatedAt
    );
  });
}

function buildStartEntryTarget(
  displayGames: DisplayGameItem[]
): StartEntryTarget {
  const latestGame = [...displayGames].sort(
    (left, right) => right.createdAt - left.createdAt
  )[0];

  if (!latestGame) {
    return {
      gameId: 'new',
      draftNonce: null,
    };
  }

  return {
    gameId: latestGame.routeGameId,
    draftNonce: latestGame.routeDraftNonce,
  };
}

function buildDisplayNightSummary(
  games: Array<
    Pick<DisplayGameItem, 'totalScore' | 'strikes' | 'spares' | 'opens'>
  >,
  gamesPerSession: number | null | undefined
) {
  const gamesPlayed = games.length;
  const targetGames = normalizeGamesPerSession(gamesPerSession);
  const totalPins = games.reduce((total, game) => total + game.totalScore, 0);
  const strikes = games.reduce((total, game) => total + game.strikes, 0);
  const spares = games.reduce((total, game) => total + game.spares, 0);
  const opens = games.reduce((total, game) => total + game.opens, 0);

  let highGame: number | null = null;
  let lowGame: number | null = null;

  for (const game of games) {
    if (highGame === null || game.totalScore > highGame) {
      highGame = game.totalScore;
    }

    if (lowGame === null || game.totalScore < lowGame) {
      lowGame = game.totalScore;
    }
  }

  const isNightComplete = targetGames !== null && gamesPlayed >= targetGames;
  const remainingGames =
    targetGames === null ? null : Math.max(targetGames - gamesPlayed, 0);

  return {
    gamesPlayed,
    targetGames,
    remainingGames,
    isNightComplete,
    totalPins,
    average: gamesPlayed === 0 ? 0 : totalPins / gamesPlayed,
    highGame,
    lowGame,
    strikes,
    spares,
    opens,
  };
}

function createDraftNonce() {
  const timestampPart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${timestampPart}-${randomPart}`;
}

export default function JournalGamesScreen() {
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
      params: {
        leagueId: mappedLeagueId,
        sessionId: mappedSessionId,
        ...(leagueClientSyncId ? { leagueClientSyncId } : {}),
        ...(sessionClientSyncId ? { sessionClientSyncId } : {}),
        ...(fallbackSessionDate ? { sessionDate: fallbackSessionDate } : {}),
        ...(Number.isFinite(fallbackSessionWeekNumber)
          ? { sessionWeekNumber: String(fallbackSessionWeekNumber) }
          : {}),
      } as never,
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
    const serverGames = toOldestFirstGames(games).map((game) => ({
      id: String(game._id),
      clientSyncId:
        typeof (game as { clientSyncId?: string | null }).clientSyncId ===
          'string' &&
        ((game as { clientSyncId?: string | null }).clientSyncId?.length ?? 0) >
          0
          ? ((game as { clientSyncId?: string | null }).clientSyncId ?? null)
          : null,
      date: game.date,
      createdAt: game._creationTime,
      totalScore: game.totalScore,
      strikes: game.strikes,
      spares: game.spares,
      opens: game.opens,
      framePreviewItems: normalizeFramePreviewItems(game.framePreview),
    }));

    const serverGameIds = new Set(serverGames.map((game) => game.id));
    stableCreatedAtByGameIdRef.current.forEach((_, gameId) => {
      if (!serverGameIds.has(gameId)) {
        stableCreatedAtByGameIdRef.current.delete(gameId);
      }
    });

    const queuedDerivedGames = queuedSessionEntries.map(buildQueueDerivedGame);
    const activeQueueIds = new Set(
      queuedDerivedGames.map((entry) => entry.queueId)
    );
    const heldQueuedGames = pendingHandoffEntries
      .filter((entry) => !activeQueueIds.has(entry.queuedGame.queueId))
      .map((entry) => entry.queuedGame);
    const queuedAndHeldGames = [...queuedDerivedGames, ...heldQueuedGames];
    const activeQueuedNewIds = new Set(
      queuedAndHeldGames
        .filter((queuedGame) => queuedGame.gameId === null)
        .map((queuedGame) => queuedGame.queueId)
    );

    syncedHandoffByQueueIdRef.current.forEach((_, queueId) => {
      if (!activeQueuedNewIds.has(queueId)) {
        syncedHandoffByQueueIdRef.current.delete(queueId);
      }
    });

    const reconciledGames = reconcileGamesForDisplay({
      serverGames,
      queuedGames: queuedAndHeldGames,
      handoffByQueueId: syncedHandoffByQueueIdRef.current,
      stableCreatedAtByGameId: stableCreatedAtByGameIdRef.current,
    });

    return reconciledGames.map(
      (game) =>
        ({
          key: game.key,
          date: game.date,
          routeGameId: game.routeGameId,
          routeDraftNonce: game.routeDraftNonce,
          deleteGameId: game.deleteGameId,
          deleteQueueId: game.deleteQueueId,
          createdAt: game.createdAt,
          totalScore: game.totalScore,
          strikes: game.strikes,
          spares: game.spares,
          opens: game.opens,
          framePreviewItems: game.framePreviewItems,
        }) satisfies DisplayGameItem
    );
  }, [games, pendingHandoffEntries, queuedSessionEntries]);

  const nightSummary = useMemo(
    () =>
      buildDisplayNightSummary(displayGames, selectedLeague?.gamesPerSession),
    [displayGames, selectedLeague?.gamesPerSession]
  );

  const openGameEditor = (gameId: string, draftNonce: string | null = null) => {
    router.push({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
      params: {
        leagueId: leagueId ?? '',
        sessionId: sessionId ?? '',
        gameId,
        ...(draftNonce ? { draftNonce } : {}),
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
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Delete game', 'Cancel'],
          cancelButtonIndex: 1,
          destructiveButtonIndex: 0,
          title: target.title,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            runGameAction(target);
          }
        }
      );

      return;
    }

    if (Platform.OS === 'android') {
      Alert.alert(target.title, undefined, [
        {
          text: 'Delete game',
          style: 'destructive',
          onPress: () => runGameAction(target),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);

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

    if (!leagueId || !sessionId || isGamesLoading) {
      return;
    }

    hasHandledStartEntryRef.current = true;
    const startEntryTarget = buildStartEntryTarget(displayGames);

    router.replace({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
      params: {
        leagueId,
        sessionId,
        gameId: startEntryTarget.gameId,
        ...(startEntryTarget.draftNonce
          ? { draftNonce: startEntryTarget.draftNonce }
          : {}),
      },
    });
  }, [
    displayGames,
    isFocused,
    isGamesLoading,
    leagueId,
    router,
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
            const framePreviewItems = game.framePreviewItems;
            const previewRowOne = Array.from(
              { length: 5 },
              (_, slotIndex) => framePreviewItems[slotIndex] ?? null
            );
            const previewRowTwo = Array.from(
              { length: 5 },
              (_, slotIndex) => framePreviewItems[slotIndex + 5] ?? null
            );
            const gameLabel = formatGameSequenceLabel(index + 1);

            return (
              <Card key={game.key} style={styles.rowCard}>
                <View style={styles.rowHeader}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.gameHeaderContent,
                      pressed ? styles.rowPressed : null,
                    ]}
                    onPress={() =>
                      openGameEditor(game.routeGameId, game.routeDraftNonce)
                    }
                  >
                    <Text style={styles.rowTitle}>
                      {gameLabel} - {game.totalScore}
                    </Text>
                    <Text style={styles.meta}>
                      {framePreviewItems.length > 0
                        ? `Strikes ${String(game.strikes)} | Spares ${String(game.spares)} | Opens ${String(game.opens)}`
                        : `Strikes ${String(game.strikes)} | Spares ${String(game.spares)} | Opens ${String(game.opens)}`}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityLabel={`Game actions for ${gameLabel}`}
                    disabled={
                      deletingGameId === (game.deleteGameId ?? game.key)
                    }
                    hitSlop={8}
                    onPress={() =>
                      openGameActions({
                        gameId: game.deleteGameId,
                        queueId: game.deleteQueueId,
                        label: gameLabel,
                        title: `${gameLabel} - ${game.totalScore}`,
                      })
                    }
                    style={({ pressed }) => [
                      styles.menuButton,
                      pressed ? styles.menuButtonPressed : null,
                    ]}
                  >
                    <MaterialIcons
                      name="more-vert"
                      size={22}
                      color={colors.textPrimary}
                    />
                  </Pressable>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.gameContent,
                    pressed ? styles.rowPressed : null,
                  ]}
                  onPress={() =>
                    openGameEditor(game.routeGameId, game.routeDraftNonce)
                  }
                >
                  {framePreviewItems.length > 0 ? (
                    <View style={styles.previewGrid}>
                      <View style={styles.previewRow}>
                        {previewRowOne.map((item, itemIndex) => (
                          <View
                            key={`${game.key}-row-1-${String(itemIndex)}`}
                            style={[
                              styles.previewChip,
                              item === null
                                ? styles.previewChipPlaceholder
                                : null,
                              item?.hasSplit ? styles.previewChipSplit : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.previewChipText,
                                item === null
                                  ? styles.previewChipPlaceholderText
                                  : null,
                                item?.hasSplit
                                  ? styles.previewChipTextSplit
                                  : null,
                              ]}
                            >
                              {item?.text ?? '-'}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.previewRow}>
                        {previewRowTwo.map((item, itemIndex) => (
                          <View
                            key={`${game.key}-row-2-${String(itemIndex)}`}
                            style={[
                              styles.previewChip,
                              item === null
                                ? styles.previewChipPlaceholder
                                : null,
                              item?.hasSplit ? styles.previewChipSplit : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.previewChipText,
                                item === null
                                  ? styles.previewChipPlaceholderText
                                  : null,
                                item?.hasSplit
                                  ? styles.previewChipTextSplit
                                  : null,
                              ]}
                            >
                              {item?.text ?? '-'}
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
              </Card>
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
              params: {
                leagueId: leagueId ?? `draft-${leagueClientSyncId ?? 'league'}`,
                sessionId:
                  sessionId ?? `draft-${sessionClientSyncId ?? 'session'}`,
                ...(leagueClientSyncId ? { leagueClientSyncId } : {}),
                ...(sessionClientSyncId ? { sessionClientSyncId } : {}),
                gameId: 'new',
                draftNonce: createDraftNonce(),
              },
            })
          }
        />

        <Modal
          animationType="fade"
          transparent
          visible={isGameActionsVisible}
          onRequestClose={closeGameActions}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={styles.modalBackdropHitbox}
              onPress={closeGameActions}
            />
            <View style={[styles.modalCard, styles.actionModalCard]}>
              <View style={styles.actionModalHeader}>
                <Text numberOfLines={1} style={styles.actionModalTitle}>
                  {gameActionTarget?.title ?? 'Game'}
                </Text>
              </View>
              <View style={styles.actionList}>
                <Pressable
                  onPress={() => {
                    if (!gameActionTarget) {
                      return;
                    }

                    closeGameActions();
                    runGameAction(gameActionTarget);
                  }}
                  style={({ pressed }) => [
                    styles.actionItem,
                    styles.actionItemWithDivider,
                    pressed ? styles.actionItemPressed : null,
                  ]}
                >
                  <Text style={styles.actionItemDeleteLabel}>Delete game</Text>
                </Pressable>
                <Pressable
                  onPress={closeGameActions}
                  style={({ pressed }) => [
                    styles.actionItem,
                    styles.actionItemCancel,
                    pressed ? styles.actionItemPressed : null,
                  ]}
                >
                  <Text style={styles.actionItemCancelLabel}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
  rowHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  gameHeaderContent: {
    flex: 1,
  },
  gameContent: {
    flex: 1,
    marginTop: spacing.xs,
  },
  menuButton: {
    width: 40,
    height: 44,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  menuButtonPressed: {
    backgroundColor: colors.surfaceMuted,
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
    opacity: 0.8,
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
    minHeight: 30,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewChipPlaceholder: {
    backgroundColor: colors.surfaceSubtle,
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
  previewChipPlaceholderText: {
    color: colors.textSecondary,
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(26, 31, 43, 0.35)',
  },
  modalBackdropHitbox: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionModalCard: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  actionModalHeader: {
    paddingTop: 2,
  },
  actionModalTitle: {
    fontSize: typeScale.titleSm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionList: {
    marginTop: spacing.xs,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSubtle,
  },
  actionItem: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  actionItemWithDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  actionItemCancel: {
    backgroundColor: colors.surface,
  },
  actionItemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  actionItemDeleteLabel: {
    fontSize: typeScale.body,
    fontWeight: '600',
    color: colors.danger,
  },
  actionItemCancelLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
