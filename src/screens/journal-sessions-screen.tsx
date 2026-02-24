import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
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
  useWindowDimensions,
  View,
} from 'react-native';

import {
  loadJournalClientSyncMap,
  type JournalClientSyncMap,
} from './journal/journal-client-sync-map-storage';
import {
  createQueuedSessionCreateEntry,
  isRetryableCreateError,
  upsertQueuedJournalCreateEntry,
  type QueuedSessionCreateEntry,
} from './journal/journal-create-queue';
import {
  loadJournalCreateQueue,
  persistJournalCreateQueue,
} from './journal/journal-create-queue-storage';
import { getCreateModalTranslateY } from './journal/modal-layout-utils';
import {
  findSessionIdForDate,
  formatIsoDateLabel,
  formatIsoDateForToday,
  formatSessionWeekLabel,
} from './journal-fast-lane-utils';

import type { LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { ReferenceCombobox } from '@/components/reference-combobox';
import { Button, Card, FloatingActionButton, Input } from '@/components/ui';
import { useLeagues, useReferenceData, useSessions } from '@/hooks/journal';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';
import { createClientSyncId } from '@/utils/client-sync-id';

function getFirstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function isNavigatorOffline() {
  return (
    typeof globalThis.navigator !== 'undefined' &&
    globalThis.navigator.onLine === false
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Create request timed out.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

type SessionActionTarget = {
  sessionId: string;
  date: string;
  weekNumber: number | null;
  houseId: string | null;
  patternId: string | null;
  ballId: string | null;
  title: string;
};

type DisplaySession = {
  id: string;
  sessionId: string | null;
  clientSyncId: string | null;
  date: string;
  weekNumber: number | null;
  houseId: string | null;
  patternId: string | null;
  ballId: string | null;
  isDraft: boolean;
};

export default function JournalSessionsScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    leagueId?: string | string[];
    leagueClientSyncId?: string | string[];
    startTonight?: string | string[];
  }>();

  const rawLeagueId = getFirstParam(params.leagueId);
  const leagueClientSyncIdParam = getFirstParam(params.leagueClientSyncId);
  const leagueClientSyncId =
    leagueClientSyncIdParam ??
    (rawLeagueId?.startsWith('draft-') ? rawLeagueId.slice(6) : null);
  const leagueId =
    rawLeagueId && !rawLeagueId.startsWith('draft-')
      ? (rawLeagueId as LeagueId)
      : null;
  const startTonight = getFirstParam(params.startTonight) === '1';
  const toGamesRouteParams = useCallback(
    (target: {
      leagueId: string;
      sessionId: string;
      sessionClientSyncId?: string | null;
      sessionDate?: string | null;
      sessionWeekNumber?: number | null;
    }) => {
      return {
        leagueId: target.leagueId,
        sessionId: target.sessionId,
        ...(leagueClientSyncId ? { leagueClientSyncId } : {}),
        ...(target.sessionClientSyncId
          ? { sessionClientSyncId: target.sessionClientSyncId }
          : {}),
        ...(target.sessionDate ? { sessionDate: target.sessionDate } : {}),
        ...(typeof target.sessionWeekNumber === 'number'
          ? { sessionWeekNumber: String(target.sessionWeekNumber) }
          : {}),
      };
    },
    [leagueClientSyncId]
  );
  const { leagues } = useLeagues();
  const {
    sessions,
    isLoading: isSessionsLoading,
    createSession,
    updateSession,
    removeSession,
    isCreating: isCreatingSession,
  } = useSessions(leagueId);

  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [sessionWeekNumber, setSessionWeekNumber] = useState('');
  const [sessionHouseId, setSessionHouseId] = useState<string | null>(null);
  const [sessionPatternId, setSessionPatternId] = useState<string | null>(null);
  const [sessionBallId, setSessionBallId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [sessionActionError, setSessionActionError] = useState<string | null>(
    null
  );
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionDate, setEditingSessionDate] = useState('');
  const [editingSessionWeekNumber, setEditingSessionWeekNumber] = useState('');
  const [editingSessionHouseId, setEditingSessionHouseId] = useState<
    string | null
  >(null);
  const [editingSessionPatternId, setEditingSessionPatternId] = useState<
    string | null
  >(null);
  const [editingSessionBallId, setEditingSessionBallId] = useState<
    string | null
  >(null);
  const [isSavingSessionEdit, setIsSavingSessionEdit] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null
  );
  const [pendingCreateClientSyncId, setPendingCreateClientSyncId] = useState<
    string | null
  >(null);
  const [isCreatingSessionRequest, setIsCreatingSessionRequest] =
    useState(false);
  const [isSessionActionsVisible, setIsSessionActionsVisible] = useState(false);
  const [sessionActionTarget, setSessionActionTarget] =
    useState<SessionActionTarget | null>(null);
  const [queuedSessionCreates, setQueuedSessionCreates] = useState<
    QueuedSessionCreateEntry[]
  >([]);
  const [draftLeagueName, setDraftLeagueName] = useState<string | null>(null);
  const [syncMap, setSyncMap] = useState<JournalClientSyncMap>({
    leagues: {},
    sessions: {},
  });
  const hasHandledStartTonightRef = useRef(false);
  const modalTranslateY = getCreateModalTranslateY(windowWidth);
  const shouldLoadReferenceData =
    isCreateModalVisible || editingSessionId !== null;
  const {
    ballOptions,
    patternOptions,
    houseOptions,
    recentBallOptions,
    recentPatternOptions,
    recentHouseOptions,
    buildSuggestions,
    createBall,
    createPattern,
    createHouse,
  } = useReferenceData({ enabled: shouldLoadReferenceData });

  const selectedLeague = useMemo(() => {
    if (leagueId) {
      return leagues.find((league) => league._id === leagueId) ?? null;
    }

    if (!leagueClientSyncId) {
      return null;
    }

    return (
      leagues.find((league) => {
        const clientSyncId =
          typeof (league as { clientSyncId?: string | null }).clientSyncId ===
          'string'
            ? (league as { clientSyncId?: string | null }).clientSyncId
            : null;

        return clientSyncId === leagueClientSyncId;
      }) ?? null
    );
  }, [leagueClientSyncId, leagueId, leagues]);

  const leagueName = selectedLeague?.name ?? draftLeagueName;
  const defaultSessionHouseId = selectedLeague?.houseId
    ? String(selectedLeague.houseId)
    : null;
  const canCreateSessionTarget = Boolean(
    leagueId || leagueClientSyncId || selectedLeague
  );

  const derivedWeekNumberBySessionId = useMemo(() => {
    const oldestFirstSessions = [...sessions].reverse();

    return new Map(
      oldestFirstSessions.map((session, index) => [session._id, index + 1])
    );
  }, [sessions]);

  const refreshQueuedSessionCreates = useCallback(async () => {
    const [queueEntries, nextSyncMap] = await Promise.all([
      loadJournalCreateQueue(),
      loadJournalClientSyncMap(),
    ]);

    setSyncMap(nextSyncMap);

    const filteredEntries = queueEntries.filter((entry) => {
      if (entry.entityType !== 'session-create') {
        return false;
      }

      if (leagueId && entry.payload.leagueId === leagueId) {
        return true;
      }

      if (
        leagueId &&
        entry.payload.leagueClientSyncId &&
        nextSyncMap.leagues[entry.payload.leagueClientSyncId] === leagueId
      ) {
        return true;
      }

      if (
        !leagueId &&
        leagueClientSyncId &&
        entry.payload.leagueClientSyncId === leagueClientSyncId
      ) {
        return true;
      }

      return false;
    }) as QueuedSessionCreateEntry[];

    setQueuedSessionCreates(filteredEntries);

    if (leagueClientSyncId) {
      const queuedLeague = queueEntries.find(
        (entry) =>
          entry.entityType === 'league-create' &&
          entry.clientSyncId === leagueClientSyncId
      );
      setDraftLeagueName(
        queuedLeague && queuedLeague.entityType === 'league-create'
          ? queuedLeague.payload.name
          : null
      );
    } else {
      setDraftLeagueName(null);
    }
  }, [leagueClientSyncId, leagueId]);

  useEffect(() => {
    void refreshQueuedSessionCreates();
  }, [refreshQueuedSessionCreates]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshQueuedSessionCreates();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [refreshQueuedSessionCreates]);

  const displaySessions = useMemo<DisplaySession[]>(() => {
    const serverByClientSyncId = new Map<string, string>();
    const serverSessions: DisplaySession[] = sessions.map((session) => {
      const clientSyncId =
        typeof (session as { clientSyncId?: string | null }).clientSyncId ===
        'string'
          ? ((session as { clientSyncId?: string | null }).clientSyncId ?? null)
          : null;

      if (clientSyncId) {
        serverByClientSyncId.set(clientSyncId, session._id);
      }

      return {
        id: session._id,
        sessionId: session._id,
        clientSyncId,
        date: session.date,
        weekNumber: session.weekNumber ?? null,
        houseId: session.houseId ? String(session.houseId) : null,
        patternId: session.patternId ? String(session.patternId) : null,
        ballId: session.ballId ? String(session.ballId) : null,
        isDraft: false,
      };
    });

    const queuedDrafts: DisplaySession[] = queuedSessionCreates
      .filter((entry) => !serverByClientSyncId.has(entry.clientSyncId))
      .map((entry) => ({
        id: `draft-${entry.clientSyncId}`,
        sessionId: null,
        clientSyncId: entry.clientSyncId,
        date: entry.payload.date,
        weekNumber: entry.payload.weekNumber ?? null,
        houseId: entry.payload.houseId ? String(entry.payload.houseId) : null,
        patternId: entry.payload.patternId
          ? String(entry.payload.patternId)
          : null,
        ballId: entry.payload.ballId ? String(entry.payload.ballId) : null,
        isDraft: true,
      }));

    return [...queuedDrafts, ...serverSessions];
  }, [queuedSessionCreates, sessions]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (leagueId || !leagueClientSyncId) {
      return;
    }

    const mappedLeagueId = syncMap.leagues[leagueClientSyncId];

    if (!mappedLeagueId) {
      return;
    }

    router.replace({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: {
        leagueId: mappedLeagueId,
      } as never,
    } as never);
  }, [isFocused, leagueClientSyncId, leagueId, router, syncMap.leagues]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (leagueId || !selectedLeague) {
      return;
    }

    router.replace({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: {
        leagueId: selectedLeague._id,
      } as never,
    } as never);
  }, [isFocused, leagueId, router, selectedLeague]);

  useEffect(() => {
    const headerValue = leagueName ?? 'Sessions';

    navigation.setOptions({
      headerTitle: headerValue,
      title: headerValue,
    });
  }, [leagueName, navigation]);

  const confirmDeleteSession = async (date: string) => {
    const message = `Delete session ${date} and all its games?`;

    if (Platform.OS === 'web') {
      return globalThis.confirm(message);
    }

    return await new Promise<boolean>((resolve) => {
      Alert.alert('Delete session?', message, [
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

  const onCreateSession = async () => {
    setSessionError(null);
    setIsCreatingSessionRequest(true);
    const clientSyncId =
      pendingCreateClientSyncId ?? createClientSyncId('session');
    const targetLeagueId = leagueId ?? selectedLeague?._id ?? null;
    const targetLeagueClientSyncId =
      leagueClientSyncId ??
      (typeof (selectedLeague as { clientSyncId?: string | null } | null)
        ?.clientSyncId === 'string'
        ? ((selectedLeague as { clientSyncId?: string | null }).clientSyncId ??
          null)
        : null);

    if (!targetLeagueId && !targetLeagueClientSyncId) {
      setSessionError('League is required before creating a session.');
      return;
    }

    const date = sessionDate.trim();

    if (date.length === 0) {
      setSessionError('Session date is required.');
      return;
    }

    let weekNumber: number | null | undefined = undefined;
    const weekInput = sessionWeekNumber.trim();

    if (weekInput.length > 0) {
      const parsed = Number(weekInput);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        setSessionError('Week number must be a positive whole number.');
        return;
      }

      weekNumber = parsed;
    }

    const queueSessionCreate = async () => {
      const now = Date.now();
      const queuedEntry = createQueuedSessionCreateEntry(
        {
          leagueId: targetLeagueId as never,
          date,
          weekNumber,
          houseId: sessionHouseId as never,
          ballId: sessionBallId as never,
          patternId: sessionPatternId as never,
        },
        clientSyncId,
        targetLeagueClientSyncId,
        now
      );
      const currentQueue = await loadJournalCreateQueue();
      const nextQueue = upsertQueuedJournalCreateEntry(
        currentQueue,
        queuedEntry
      );
      await persistJournalCreateQueue(nextQueue);
      setQueuedSessionCreates(
        nextQueue.filter(
          (entry): entry is QueuedSessionCreateEntry =>
            entry.entityType === 'session-create'
        )
      );
      setSessionError(null);
      setIsCreateModalVisible(false);
      setSessionWeekNumber('');
      setSessionHouseId(null);
      setSessionBallId(null);
      setSessionPatternId(null);
      setPendingCreateClientSyncId(null);
      router.push({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
        params: toGamesRouteParams({
          leagueId: targetLeagueId ?? `draft-${targetLeagueClientSyncId}`,
          sessionId: `draft-${clientSyncId}`,
          sessionClientSyncId: clientSyncId,
          sessionDate: date,
          sessionWeekNumber: weekNumber ?? null,
        }) as never,
      } as never);
    };

    try {
      if (!targetLeagueId || isNavigatorOffline()) {
        await queueSessionCreate();
        return;
      }

      const sessionId = await withTimeout(
        createSession({
          leagueId: targetLeagueId,
          clientSyncId,
          date,
          weekNumber,
          houseId: sessionHouseId as never,
          ballId: sessionBallId as never,
          patternId: sessionPatternId as never,
        }),
        4500
      );
      setSessionError(null);
      setIsCreateModalVisible(false);
      setSessionWeekNumber('');
      setSessionHouseId(null);
      setSessionBallId(null);
      setSessionPatternId(null);
      setPendingCreateClientSyncId(null);
      router.push({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
        params: toGamesRouteParams({
          leagueId: targetLeagueId,
          sessionId,
          sessionDate: date,
          sessionWeekNumber: weekNumber ?? null,
        }) as never,
      } as never);
    } catch (caught) {
      if (isRetryableCreateError(caught)) {
        await queueSessionCreate();
        return;
      }

      setPendingCreateClientSyncId(clientSyncId);
      setSessionError(
        caught instanceof Error ? caught.message : 'Unable to create session.'
      );
    } finally {
      setIsCreatingSessionRequest(false);
    }
  };

  const startEditingSession = (
    sessionId: string,
    date: string,
    weekNumber: number | null,
    houseId: string | null,
    patternId: string | null,
    ballId: string | null
  ) => {
    setSessionActionError(null);
    setEditingSessionId(sessionId);
    setEditingSessionDate(date);
    setEditingSessionWeekNumber(weekNumber === null ? '' : String(weekNumber));
    setEditingSessionHouseId(houseId);
    setEditingSessionPatternId(patternId);
    setEditingSessionBallId(ballId);
  };

  const cancelEditingSession = () => {
    setEditingSessionId(null);
    setEditingSessionDate('');
    setEditingSessionWeekNumber('');
    setEditingSessionHouseId(null);
    setEditingSessionPatternId(null);
    setEditingSessionBallId(null);
  };

  const onSaveSessionEdit = async () => {
    if (!editingSessionId) {
      return;
    }

    setSessionActionError(null);
    const date = editingSessionDate.trim();

    if (date.length === 0) {
      setSessionActionError('Session date is required.');
      return;
    }

    let weekNumber: number | null | undefined = undefined;
    const weekInput = editingSessionWeekNumber.trim();

    if (weekInput.length > 0) {
      const parsed = Number(weekInput);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        setSessionActionError('Week number must be a positive whole number.');
        return;
      }

      weekNumber = parsed;
    }

    setIsSavingSessionEdit(true);

    try {
      await updateSession({
        sessionId: editingSessionId as SessionId,
        date,
        weekNumber,
        houseId: editingSessionHouseId as never,
        patternId: editingSessionPatternId as never,
        ballId: editingSessionBallId as never,
      });
      cancelEditingSession();
    } catch (caught) {
      setSessionActionError(
        caught instanceof Error ? caught.message : 'Unable to update session.'
      );
    } finally {
      setIsSavingSessionEdit(false);
    }
  };

  const onDeleteSession = async (sessionId: string, date: string) => {
    setSessionActionError(null);
    const isConfirmed = await confirmDeleteSession(date);

    if (!isConfirmed) {
      return;
    }

    setDeletingSessionId(sessionId);

    try {
      await removeSession({ sessionId: sessionId as SessionId });

      if (editingSessionId === sessionId) {
        cancelEditingSession();
      }
    } catch (caught) {
      setSessionActionError(
        caught instanceof Error ? caught.message : 'Unable to delete session.'
      );
    } finally {
      setDeletingSessionId(null);
    }
  };

  const closeSessionActions = () => {
    setIsSessionActionsVisible(false);
    setSessionActionTarget(null);
  };

  const runSessionAction = (
    action: 'edit' | 'delete',
    target: SessionActionTarget
  ) => {
    if (action === 'edit') {
      startEditingSession(
        target.sessionId,
        target.date,
        target.weekNumber,
        target.houseId,
        target.patternId,
        target.ballId
      );
      return;
    }

    void onDeleteSession(target.sessionId, target.date);
  };

  const openSessionActions = (target: SessionActionTarget) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Edit session', 'Delete session', 'Cancel'],
          cancelButtonIndex: 2,
          destructiveButtonIndex: 1,
          title: target.title,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            runSessionAction('edit', target);
            return;
          }

          if (buttonIndex === 1) {
            runSessionAction('delete', target);
          }
        }
      );

      return;
    }

    if (Platform.OS === 'android') {
      Alert.alert(target.title, undefined, [
        {
          text: 'Edit session',
          onPress: () => runSessionAction('edit', target),
        },
        {
          text: 'Delete session',
          style: 'destructive',
          onPress: () => runSessionAction('delete', target),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);

      return;
    }

    setSessionActionTarget(target);
    setIsSessionActionsVisible(true);
  };

  const openCreateModal = () => {
    setSessionError(null);
    setSessionHouseId(defaultSessionHouseId);
    setIsCreateModalVisible(true);
  };

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (!startTonight || hasHandledStartTonightRef.current) {
      return;
    }

    if (!leagueId || isSessionsLoading || isCreatingSession) {
      return;
    }

    hasHandledStartTonightRef.current = true;
    const today = formatIsoDateForToday();
    const existingSessionId = findSessionIdForDate(sessions, today);

    if (existingSessionId) {
      router.replace({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
        params: {
          leagueId,
          sessionId: existingSessionId,
          startEntry: '1',
          sessionDate: today,
        } as never,
      } as never);
      return;
    }

    void (async () => {
      try {
        const sessionId = await createSession({
          leagueId,
          date: today,
        });
        router.replace({
          pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
          params: {
            leagueId,
            sessionId,
            startEntry: '1',
            sessionDate: today,
          } as never,
        } as never);
      } catch (caught) {
        setSessionError(
          caught instanceof Error
            ? caught.message
            : 'Unable to start league night.'
        );
      }
    })();
  }, [
    createSession,
    isCreatingSession,
    isFocused,
    isSessionsLoading,
    leagueId,
    router,
    sessions,
    startTonight,
  ]);

  return (
    <ScreenLayout
      title="Sessions"
      subtitle={
        leagueName ? `League: ${leagueName}` : 'Review and create sessions.'
      }
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
          {sessionActionError ? (
            <Text style={styles.errorText}>{sessionActionError}</Text>
          ) : null}

          {isSessionsLoading ? (
            <Text style={styles.meta}>Loading sessions...</Text>
          ) : null}
          {!isSessionsLoading && !leagueId && !leagueClientSyncId ? (
            <Text style={styles.meta}>League not found.</Text>
          ) : null}
          {!isSessionsLoading &&
          (leagueId || leagueClientSyncId) &&
          displaySessions.length === 0 ? (
            <Text style={styles.meta}>
              No sessions yet. Tap + to create one.
            </Text>
          ) : null}

          {displaySessions.map((session) => (
            <Card
              key={session.id}
              style={[
                styles.rowCard,
                editingSessionId === session.sessionId
                  ? styles.rowCardActive
                  : null,
              ]}
            >
              <View style={styles.rowHeader}>
                <Pressable
                  style={({ pressed }) => [
                    styles.sessionContent,
                    pressed ? styles.rowPressed : null,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname:
                        '/journal/[leagueId]/sessions/[sessionId]/games' as never,
                      params: toGamesRouteParams({
                        leagueId:
                          leagueId ?? `draft-${leagueClientSyncId ?? 'league'}`,
                        sessionId:
                          session.sessionId ??
                          `draft-${session.clientSyncId ?? 'session'}`,
                        sessionClientSyncId: session.clientSyncId,
                        sessionDate: session.date,
                        sessionWeekNumber:
                          session.weekNumber ??
                          (session.sessionId
                            ? (derivedWeekNumberBySessionId.get(
                                session.sessionId as SessionId
                              ) ?? null)
                            : null),
                      }) as never,
                    } as never)
                  }
                >
                  <Text style={styles.rowTitle}>
                    {formatSessionWeekLabel(
                      session.weekNumber ??
                        (session.sessionId
                          ? (derivedWeekNumberBySessionId.get(
                              session.sessionId as SessionId
                            ) ?? null)
                          : null) ??
                        1
                    )}
                  </Text>
                  <Text style={styles.meta}>
                    {formatIsoDateLabel(session.date)}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Session actions for ${formatIsoDateLabel(session.date)}`}
                  disabled={
                    session.isDraft || deletingSessionId === session.sessionId
                  }
                  hitSlop={8}
                  onPress={() =>
                    openSessionActions({
                      sessionId: session.sessionId ?? '',
                      date: session.date,
                      weekNumber: session.weekNumber ?? null,
                      houseId: session.houseId,
                      patternId: session.patternId,
                      ballId: session.ballId,
                      title: `${formatSessionWeekLabel(
                        session.weekNumber ??
                          (session.sessionId
                            ? (derivedWeekNumberBySessionId.get(
                                session.sessionId as SessionId
                              ) ?? null)
                            : null) ??
                          1
                      )} - ${formatIsoDateLabel(session.date)}`,
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

              {session.sessionId && editingSessionId === session.sessionId ? (
                <View style={styles.editSection}>
                  <Input
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setEditingSessionDate}
                    placeholder="YYYY-MM-DD"
                    value={editingSessionDate}
                  />
                  <Input
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    onChangeText={setEditingSessionWeekNumber}
                    placeholder="Week number (optional)"
                    value={editingSessionWeekNumber}
                  />
                  <ReferenceCombobox
                    allOptions={houseOptions}
                    createLabel="Add house"
                    getSuggestions={buildSuggestions}
                    onQuickAdd={createHouse}
                    onSelect={(option) => setEditingSessionHouseId(option.id)}
                    placeholder="House (optional)"
                    recentOptions={recentHouseOptions}
                    valueId={editingSessionHouseId}
                  />
                  <ReferenceCombobox
                    allOptions={patternOptions}
                    createLabel="Add pattern"
                    getSuggestions={buildSuggestions}
                    onQuickAdd={createPattern}
                    onSelect={(option) => setEditingSessionPatternId(option.id)}
                    placeholder="Pattern (optional)"
                    recentOptions={recentPatternOptions}
                    valueId={editingSessionPatternId}
                  />
                  <ReferenceCombobox
                    allOptions={ballOptions}
                    createLabel="Add ball"
                    getSuggestions={buildSuggestions}
                    onQuickAdd={createBall}
                    onSelect={(option) => setEditingSessionBallId(option.id)}
                    placeholder="Ball (optional)"
                    recentOptions={recentBallOptions}
                    valueId={editingSessionBallId}
                  />
                  <View style={styles.editActionsRow}>
                    <View style={styles.editActionButton}>
                      <Button
                        disabled={isSavingSessionEdit}
                        label={isSavingSessionEdit ? 'Saving...' : 'Save'}
                        onPress={() => void onSaveSessionEdit()}
                        variant="secondary"
                      />
                    </View>
                    <View style={styles.editActionButton}>
                      <Button
                        disabled={isSavingSessionEdit}
                        label="Cancel"
                        onPress={cancelEditingSession}
                        variant="ghost"
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </Card>
          ))}
        </ScrollView>

        <FloatingActionButton
          accessibilityLabel="Create session"
          disabled={!canCreateSessionTarget}
          onPress={openCreateModal}
        />

        <Modal
          animationType="fade"
          transparent
          visible={isSessionActionsVisible}
          onRequestClose={closeSessionActions}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={styles.modalBackdropHitbox}
              onPress={closeSessionActions}
            />
            <View
              style={[
                styles.modalCard,
                styles.actionModalCard,
                { transform: [{ translateY: modalTranslateY }] },
              ]}
            >
              <View style={styles.actionModalHeader}>
                <Text numberOfLines={1} style={styles.actionModalTitle}>
                  {sessionActionTarget?.title ?? 'Session'}
                </Text>
              </View>
              <View style={styles.actionList}>
                <Pressable
                  onPress={() => {
                    if (!sessionActionTarget) {
                      return;
                    }

                    closeSessionActions();
                    runSessionAction('edit', sessionActionTarget);
                  }}
                  style={({ pressed }) => [
                    styles.actionItem,
                    styles.actionItemWithDivider,
                    pressed ? styles.actionItemPressed : null,
                  ]}
                >
                  <Text style={styles.actionItemLabel}>Edit session</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!sessionActionTarget) {
                      return;
                    }

                    closeSessionActions();
                    runSessionAction('delete', sessionActionTarget);
                  }}
                  style={({ pressed }) => [
                    styles.actionItem,
                    styles.actionItemWithDivider,
                    pressed ? styles.actionItemPressed : null,
                  ]}
                >
                  <Text style={styles.actionItemDeleteLabel}>
                    Delete session
                  </Text>
                </Pressable>
                <Pressable
                  onPress={closeSessionActions}
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

        <Modal
          animationType="slide"
          transparent
          visible={isCreateModalVisible}
          onRequestClose={() => setIsCreateModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={styles.modalBackdropHitbox}
              onPress={() => setIsCreateModalVisible(false)}
            />
            <View
              style={[
                styles.modalCard,
                { transform: [{ translateY: modalTranslateY }] },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create session</Text>
                <Pressable
                  accessibilityLabel="Close create session dialog"
                  accessibilityRole="button"
                  onPress={() => setIsCreateModalVisible(false)}
                  style={({ pressed }) => [
                    styles.modalCloseButton,
                    pressed ? styles.modalCloseButtonPressed : null,
                  ]}
                >
                  <Text style={styles.modalCloseLabel}>X</Text>
                </Pressable>
              </View>
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setSessionDate}
                placeholder="YYYY-MM-DD"
                value={sessionDate}
              />
              <Input
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                onChangeText={setSessionWeekNumber}
                placeholder="Week number (optional)"
                value={sessionWeekNumber}
              />
              <ReferenceCombobox
                allOptions={houseOptions}
                createLabel="Add house"
                getSuggestions={buildSuggestions}
                onQuickAdd={createHouse}
                onSelect={(option) => setSessionHouseId(option.id)}
                placeholder="House (optional)"
                recentOptions={recentHouseOptions}
                valueId={sessionHouseId}
              />
              <ReferenceCombobox
                allOptions={patternOptions}
                createLabel="Add pattern"
                getSuggestions={buildSuggestions}
                onQuickAdd={createPattern}
                onSelect={(option) => setSessionPatternId(option.id)}
                placeholder="Pattern (optional)"
                recentOptions={recentPatternOptions}
                valueId={sessionPatternId}
              />
              <ReferenceCombobox
                allOptions={ballOptions}
                createLabel="Add ball"
                getSuggestions={buildSuggestions}
                onQuickAdd={createBall}
                onSelect={(option) => setSessionBallId(option.id)}
                placeholder="Ball (optional)"
                recentOptions={recentBallOptions}
                valueId={sessionBallId}
              />
              {sessionError ? (
                <Text style={styles.errorText}>{sessionError}</Text>
              ) : null}
              <View style={styles.modalActions}>
                <View style={styles.modalActionButton}>
                  <Button
                    disabled={
                      isCreatingSessionRequest || !canCreateSessionTarget
                    }
                    label={isCreatingSessionRequest ? 'Creating...' : 'Create'}
                    onPress={onCreateSession}
                    variant="secondary"
                  />
                </View>
                <View style={styles.modalActionButton}>
                  <Button
                    disabled={isCreatingSessionRequest}
                    label="Cancel"
                    onPress={() => setIsCreateModalVisible(false)}
                    variant="ghost"
                  />
                </View>
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
  errorText: {
    fontSize: typeScale.bodySm,
    color: colors.danger,
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
  sessionContent: {
    flex: 1,
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
  editSection: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  editActionButton: {
    flex: 1,
  },
  meta: {
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
  rowCardActive: {
    position: 'relative',
    zIndex: 30,
    elevation: 30,
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: typeScale.titleSm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCloseButtonPressed: {
    opacity: 0.8,
  },
  modalCloseLabel: {
    fontSize: typeScale.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  modalActionButton: {
    flex: 1,
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
  actionItemLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.textPrimary,
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
