import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { CreateSessionModal } from './journal/components/create-session-modal';
import { SessionActionsModal } from './journal/components/session-actions-modal';
import { SessionRowCard } from './journal/components/session-row-card';
import { openJournalNativeActionSheet } from './journal/journal-action-sheet';
import {
  loadJournalClientSyncMap,
  type JournalClientSyncMap,
} from './journal/journal-client-sync-map-storage';
import {
  createQueuedSessionDeleteEntry,
  createQueuedSessionCreateEntry,
  createQueuedSessionUpdateEntry,
  isRetryableCreateError,
  upsertQueuedJournalCreateEntry,
  type QueuedSessionCreateEntry,
} from './journal/journal-create-queue';
import {
  loadJournalCreateQueue,
  persistJournalCreateQueue,
} from './journal/journal-create-queue-storage';
import {
  isNavigatorOffline,
  withTimeout,
} from './journal/journal-offline-create';
import {
  buildJournalGamesRouteParams,
  getFirstParam,
} from './journal/journal-route-params';
import { getCreateModalTranslateY } from './journal/modal-layout-utils';
import {
  formatIsoDateLabel,
  formatIsoDateForToday,
  formatSessionWeekLabel,
} from './journal-fast-lane-utils';

import type { LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { FloatingActionButton } from '@/components/ui';
import { useLeagues, useReferenceData, useSessions } from '@/hooks/journal';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { createClientSyncId } from '@/utils/client-sync-id';

type SessionActionTarget = {
  rowId: string;
  sessionId: string | null;
  sessionClientSyncId: string | null;
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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const [editingSessionRowId, setEditingSessionRowId] = useState<string | null>(
    null
  );
  const [editingSessionServerId, setEditingSessionServerId] = useState<
    string | null
  >(null);
  const [editingSessionClientSyncId, setEditingSessionClientSyncId] = useState<
    string | null
  >(null);
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
  const [deletingSessionRowId, setDeletingSessionRowId] = useState<
    string | null
  >(null);
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
    houses: {},
    patterns: {},
    balls: {},
  });
  const hasHandledStartTonightRef = useRef(false);
  const modalTranslateY = getCreateModalTranslateY(windowWidth);
  const shouldLoadReferenceData =
    isCreateModalVisible || editingSessionRowId !== null;
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
  const getNextSessionWeekNumber = useCallback(
    (sessionCreateEntries: QueuedSessionCreateEntry[]) => {
      const candidateWeeks: number[] = [];

      sessions.forEach((session) => {
        const derivedWeek =
          session.weekNumber ??
          derivedWeekNumberBySessionId.get(session._id) ??
          null;

        if (typeof derivedWeek === 'number' && Number.isInteger(derivedWeek)) {
          candidateWeeks.push(derivedWeek);
        }
      });

      sessionCreateEntries.forEach((entry) => {
        const queuedWeek = entry.payload.weekNumber;

        if (typeof queuedWeek === 'number' && Number.isInteger(queuedWeek)) {
          candidateWeeks.push(queuedWeek);
        }
      });

      if (candidateWeeks.length > 0) {
        return Math.max(...candidateWeeks) + 1;
      }

      return sessions.length + sessionCreateEntries.length + 1;
    },
    [derivedWeekNumberBySessionId, sessions]
  );
  const suggestedSessionWeekNumber = useMemo(() => {
    return getNextSessionWeekNumber(queuedSessionCreates);
  }, [getNextSessionWeekNumber, queuedSessionCreates]);

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
        params: buildJournalGamesRouteParams({
          leagueId: targetLeagueId ?? `draft-${targetLeagueClientSyncId}`,
          sessionId: `draft-${clientSyncId}`,
          leagueClientSyncId,
          sessionClientSyncId: clientSyncId,
          sessionDate: date,
          sessionWeekNumber: weekNumber ?? null,
        }) as never,
      } as never);
    };

    setIsCreatingSessionRequest(true);

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
        params: buildJournalGamesRouteParams({
          leagueId: targetLeagueId,
          sessionId,
          leagueClientSyncId,
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
    rowId: string,
    sessionId: string | null,
    sessionClientSyncId: string | null,
    date: string,
    weekNumber: number | null,
    houseId: string | null,
    patternId: string | null,
    ballId: string | null
  ) => {
    setSessionActionError(null);
    setEditingSessionRowId(rowId);
    setEditingSessionServerId(sessionId);
    setEditingSessionClientSyncId(sessionClientSyncId);
    setEditingSessionDate(date);
    setEditingSessionWeekNumber(weekNumber === null ? '' : String(weekNumber));
    setEditingSessionHouseId(houseId);
    setEditingSessionPatternId(patternId);
    setEditingSessionBallId(ballId);
  };

  const cancelEditingSession = () => {
    setEditingSessionRowId(null);
    setEditingSessionServerId(null);
    setEditingSessionClientSyncId(null);
    setEditingSessionDate('');
    setEditingSessionWeekNumber('');
    setEditingSessionHouseId(null);
    setEditingSessionPatternId(null);
    setEditingSessionBallId(null);
  };

  const onSaveSessionEdit = async () => {
    if (!editingSessionRowId) {
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

    const queueSessionUpdate = async () => {
      const now = Date.now();
      const queuedEntry = createQueuedSessionUpdateEntry(
        {
          sessionId: editingSessionServerId as never,
          sessionClientSyncId: editingSessionClientSyncId,
          date,
          weekNumber,
          houseId: editingSessionHouseId as never,
          patternId: editingSessionPatternId as never,
          ballId: editingSessionBallId as never,
        },
        now
      );
      const currentQueue = await loadJournalCreateQueue();
      const nextQueue = upsertQueuedJournalCreateEntry(
        currentQueue,
        queuedEntry
      );
      await persistJournalCreateQueue(nextQueue);
      await refreshQueuedSessionCreates();
      cancelEditingSession();
    };

    try {
      if (!editingSessionServerId || isNavigatorOffline()) {
        await queueSessionUpdate();
        return;
      }

      await updateSession({
        sessionId: editingSessionServerId as SessionId,
        date,
        weekNumber,
        houseId: editingSessionHouseId as never,
        patternId: editingSessionPatternId as never,
        ballId: editingSessionBallId as never,
      });
      cancelEditingSession();
    } catch (caught) {
      if (isRetryableCreateError(caught)) {
        await queueSessionUpdate();
        return;
      }

      setSessionActionError(
        caught instanceof Error ? caught.message : 'Unable to update session.'
      );
    } finally {
      setIsSavingSessionEdit(false);
    }
  };

  const onDeleteSession = async (target: SessionActionTarget) => {
    setSessionActionError(null);
    const isConfirmed = await confirmDeleteSession(target.date);

    if (!isConfirmed) {
      return;
    }

    setDeletingSessionRowId(target.rowId);

    const queueSessionDelete = async () => {
      const now = Date.now();
      const queuedEntry = createQueuedSessionDeleteEntry(
        {
          sessionId: target.sessionId as never,
          sessionClientSyncId: target.sessionClientSyncId,
        },
        now
      );
      const currentQueue = await loadJournalCreateQueue();
      const nextQueue = upsertQueuedJournalCreateEntry(
        currentQueue,
        queuedEntry
      );
      await persistJournalCreateQueue(nextQueue);
      await refreshQueuedSessionCreates();

      if (editingSessionRowId === target.rowId) {
        cancelEditingSession();
      }
    };

    try {
      if (!target.sessionId || isNavigatorOffline()) {
        await queueSessionDelete();
        return;
      }

      await removeSession({ sessionId: target.sessionId as SessionId });

      if (editingSessionRowId === target.rowId) {
        cancelEditingSession();
      }
    } catch (caught) {
      if (isRetryableCreateError(caught)) {
        await queueSessionDelete();
        return;
      }

      setSessionActionError(
        caught instanceof Error ? caught.message : 'Unable to delete session.'
      );
    } finally {
      setDeletingSessionRowId(null);
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
        target.rowId,
        target.sessionId,
        target.sessionClientSyncId,
        target.date,
        target.weekNumber,
        target.houseId,
        target.patternId,
        target.ballId
      );
      return;
    }

    void onDeleteSession(target);
  };

  const openSessionActions = (target: SessionActionTarget) => {
    const handled = openJournalNativeActionSheet({
      title: target.title,
      actions: [
        {
          label: 'Edit session',
          onPress: () => runSessionAction('edit', target),
        },
        {
          label: 'Delete session',
          destructive: true,
          onPress: () => runSessionAction('delete', target),
        },
      ],
    });

    if (handled) {
      return;
    }

    setSessionActionTarget(target);
    setIsSessionActionsVisible(true);
  };

  const openCreateModal = useCallback(() => {
    setSessionError(null);
    setSessionHouseId(defaultSessionHouseId);
    setSessionWeekNumber(String(suggestedSessionWeekNumber));
    setIsCreateModalVisible(true);

    void (async () => {
      const [queueEntries, latestSyncMap] = await Promise.all([
        loadJournalCreateQueue(),
        loadJournalClientSyncMap(),
      ]);

      const matchingQueuedCreates = queueEntries.filter((entry) => {
        if (entry.entityType !== 'session-create') {
          return false;
        }

        if (leagueId && entry.payload.leagueId === leagueId) {
          return true;
        }

        if (
          leagueId &&
          entry.payload.leagueClientSyncId &&
          latestSyncMap.leagues[entry.payload.leagueClientSyncId] === leagueId
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

      setSessionWeekNumber(
        String(getNextSessionWeekNumber(matchingQueuedCreates))
      );
    })();
  }, [
    defaultSessionHouseId,
    getNextSessionWeekNumber,
    leagueClientSyncId,
    leagueId,
    suggestedSessionWeekNumber,
  ]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (!startTonight || hasHandledStartTonightRef.current) {
      return;
    }

    const targetLeagueRouteId = leagueId ?? rawLeagueId;

    if (!targetLeagueRouteId || isSessionsLoading || isCreatingSession) {
      return;
    }

    hasHandledStartTonightRef.current = true;
    const today = formatIsoDateForToday();
    const existingDisplaySession = displaySessions.find(
      (session) => session.date === today
    );

    if (existingDisplaySession) {
      const targetSessionRouteId =
        existingDisplaySession.sessionId ??
        `draft-${existingDisplaySession.clientSyncId ?? 'session'}`;

      router.replace({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
        params: buildJournalGamesRouteParams({
          leagueId: targetLeagueRouteId,
          sessionId: targetSessionRouteId,
          leagueClientSyncId,
          sessionClientSyncId: existingDisplaySession.clientSyncId,
          sessionDate: today,
          sessionWeekNumber: existingDisplaySession.weekNumber,
          startEntry: true,
        }) as never,
      } as never);
      return;
    }

    if (!leagueId && leagueClientSyncId) {
      void (async () => {
        const clientSyncId = createClientSyncId('session');
        const queuedEntry = createQueuedSessionCreateEntry(
          {
            leagueId: null as never,
            date: today,
          },
          clientSyncId,
          leagueClientSyncId,
          Date.now()
        );
        const currentQueue = await loadJournalCreateQueue();
        const nextQueue = upsertQueuedJournalCreateEntry(
          currentQueue,
          queuedEntry
        );
        await persistJournalCreateQueue(nextQueue);
        await refreshQueuedSessionCreates();

        router.replace({
          pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
          params: buildJournalGamesRouteParams({
            leagueId: targetLeagueRouteId,
            sessionId: `draft-${clientSyncId}`,
            leagueClientSyncId,
            sessionClientSyncId: clientSyncId,
            sessionDate: today,
          }) as never,
        } as never);
      })();

      return;
    }

    if (!leagueId) {
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
          params: buildJournalGamesRouteParams({
            leagueId: targetLeagueRouteId,
            sessionId,
            leagueClientSyncId,
            sessionDate: today,
          }) as never,
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
    displaySessions,
    isCreatingSession,
    isFocused,
    isSessionsLoading,
    leagueClientSyncId,
    leagueId,
    rawLeagueId,
    refreshQueuedSessionCreates,
    router,
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
            <SessionRowCard
              key={session.id}
              ballOptions={ballOptions}
              buildSuggestions={buildSuggestions}
              createBall={createBall}
              createHouse={createHouse}
              createPattern={createPattern}
              editingSessionBallId={editingSessionBallId}
              editingSessionDate={editingSessionDate}
              editingSessionHouseId={editingSessionHouseId}
              editingSessionPatternId={editingSessionPatternId}
              editingSessionWeekNumber={editingSessionWeekNumber}
              houseOptions={houseOptions}
              isDeleting={deletingSessionRowId === session.id}
              isEditing={editingSessionRowId === session.id}
              isSavingSessionEdit={isSavingSessionEdit}
              onCancelEditingSession={cancelEditingSession}
              onEditingSessionBallSelect={(option) =>
                setEditingSessionBallId(option.id)
              }
              onEditingSessionDateChange={setEditingSessionDate}
              onEditingSessionHouseSelect={(option) =>
                setEditingSessionHouseId(option.id)
              }
              onEditingSessionPatternSelect={(option) =>
                setEditingSessionPatternId(option.id)
              }
              onEditingSessionWeekNumberChange={setEditingSessionWeekNumber}
              onNavigate={() =>
                router.push({
                  pathname:
                    '/journal/[leagueId]/sessions/[sessionId]/games' as never,
                  params: buildJournalGamesRouteParams({
                    leagueId:
                      leagueId ?? `draft-${leagueClientSyncId ?? 'league'}`,
                    sessionId:
                      session.sessionId ??
                      `draft-${session.clientSyncId ?? 'session'}`,
                    leagueClientSyncId,
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
              onOpenActions={() =>
                openSessionActions({
                  rowId: session.id,
                  sessionId: session.sessionId,
                  sessionClientSyncId: session.clientSyncId,
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
              onSaveSessionEdit={() => {
                void onSaveSessionEdit();
              }}
              patternOptions={patternOptions}
              recentBallOptions={recentBallOptions}
              recentHouseOptions={recentHouseOptions}
              recentPatternOptions={recentPatternOptions}
              sessionDateLabel={formatIsoDateLabel(session.date)}
              sessionWeekLabel={formatSessionWeekLabel(
                session.weekNumber ??
                  (session.sessionId
                    ? (derivedWeekNumberBySessionId.get(
                        session.sessionId as SessionId
                      ) ?? null)
                    : null) ??
                  1
              )}
            />
          ))}
        </ScrollView>

        <FloatingActionButton
          accessibilityLabel="Create session"
          disabled={!canCreateSessionTarget}
          onPress={openCreateModal}
        />

        <SessionActionsModal
          modalTranslateY={modalTranslateY}
          onAction={runSessionAction}
          onClose={closeSessionActions}
          target={sessionActionTarget}
          visible={isSessionActionsVisible}
        />

        <CreateSessionModal
          ballOptions={ballOptions}
          buildSuggestions={buildSuggestions}
          canCreateSessionTarget={canCreateSessionTarget}
          createBall={createBall}
          createHouse={createHouse}
          createPattern={createPattern}
          houseOptions={houseOptions}
          isCreatingSessionRequest={isCreatingSessionRequest}
          modalTranslateY={modalTranslateY}
          onClose={() => setIsCreateModalVisible(false)}
          onCreate={onCreateSession}
          onSessionBallSelect={(option) => setSessionBallId(option.id)}
          onSessionDateChange={setSessionDate}
          onSessionHouseSelect={(option) => setSessionHouseId(option.id)}
          onSessionPatternSelect={(option) => setSessionPatternId(option.id)}
          onSessionWeekNumberChange={setSessionWeekNumber}
          patternOptions={patternOptions}
          recentBallOptions={recentBallOptions}
          recentHouseOptions={recentHouseOptions}
          recentPatternOptions={recentPatternOptions}
          sessionBallId={sessionBallId}
          sessionDate={sessionDate}
          sessionError={sessionError}
          sessionHouseId={sessionHouseId}
          sessionPatternId={sessionPatternId}
          sessionWeekNumber={sessionWeekNumber}
          visible={isCreateModalVisible}
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
  });
