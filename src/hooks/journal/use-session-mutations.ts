import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';

import type { SessionActionTarget } from '@/screens/journal/components/session-actions-modal';
import type { LeagueId, SessionId } from '@/services/journal';
import type { Router } from 'expo-router';

import { openJournalNativeActionSheet } from '@/screens/journal/journal-action-sheet';
import { loadJournalClientSyncMap } from '@/screens/journal/journal-client-sync-map-storage';
import { type QueuedSessionCreateEntry } from '@/screens/journal/journal-create-queue';
import { loadJournalCreateQueue } from '@/screens/journal/journal-create-queue-storage';
import { buildJournalGamesRouteParams } from '@/screens/journal/journal-route-params';
import { formatIsoDateForToday } from '@/screens/journal-fast-lane-utils';
import { createClientSyncId } from '@/utils/client-sync-id';

type SelectedLeague = {
  _id: string;
  clientSyncId?: string | null;
} | null;

type UseSessionMutationsParams = {
  leagueId: LeagueId | null;
  leagueClientSyncId: string | null;
  selectedLeague: SelectedLeague;
  createSession: (input: {
    leagueId: LeagueId;
    clientSyncId?: string;
    date: string;
    weekNumber?: number | null;
    houseId?: never;
    ballId?: never;
    patternId?: never;
  }) => Promise<SessionId>;
  updateSession: (input: {
    sessionId: SessionId;
    date: string;
    weekNumber?: number | null;
    houseId?: never;
    patternId?: never;
    ballId?: never;
  }) => Promise<unknown>;
  removeSession: (input: { sessionId: SessionId }) => Promise<unknown>;
  refreshQueuedSessionCreates: () => Promise<void>;
  getNextSessionWeekNumber: (entries: QueuedSessionCreateEntry[]) => number;
  suggestedSessionWeekNumber: number;
  defaultSessionHouseId: string | null;
  setQueuedSessionCreates: (entries: QueuedSessionCreateEntry[]) => void;
  router: Router;
};

export function useSessionMutations({
  leagueId,
  leagueClientSyncId,
  selectedLeague,
  createSession,
  updateSession,
  removeSession,
  refreshQueuedSessionCreates: _refreshQueuedSessionCreates,
  getNextSessionWeekNumber,
  suggestedSessionWeekNumber,
  defaultSessionHouseId,
  setQueuedSessionCreates: _setQueuedSessionCreates,
  router,
}: UseSessionMutationsParams) {
  // Create form state
  const [sessionDate, setSessionDate] = useState(formatIsoDateForToday());
  const [sessionWeekNumber, setSessionWeekNumber] = useState('');
  const [sessionHouseId, setSessionHouseId] = useState<string | null>(null);
  const [sessionPatternId, setSessionPatternId] = useState<string | null>(null);
  const [sessionBallId, setSessionBallId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [pendingCreateClientSyncId, setPendingCreateClientSyncId] = useState<
    string | null
  >(null);
  const [isCreatingSessionRequest, setIsCreatingSessionRequest] =
    useState(false);

  // Edit form state
  const [sessionActionError, setSessionActionError] = useState<string | null>(
    null
  );
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingSessionServerId, setEditingSessionServerId] = useState<
    string | null
  >(null);
  const [editingSessionClientSyncId, setEditingSessionClientSyncId] = useState<
    string | null
  >(null);
  const [editingSessionDate, setEditingSessionDate] = useState('');
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

  // Action/deletion state
  const [deletingSessionRowId, setDeletingSessionRowId] = useState<
    string | null
  >(null);
  const [isSessionActionsVisible, setIsSessionActionsVisible] = useState(false);
  const [sessionActionTarget, setSessionActionTarget] =
    useState<SessionActionTarget | null>(null);

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

  const cancelEditingSession = () => {
    setIsEditModalVisible(false);
    setEditingSessionServerId(null);
    setEditingSessionClientSyncId(null);
    setEditingSessionDate('');
    setEditingSessionHouseId(null);
    setEditingSessionPatternId(null);
    setEditingSessionBallId(null);
  };

  const startEditingSession = (
    _rowId: string,
    sessionId: string | null,
    sessionClientSyncId: string | null,
    date: string,
    _weekNumber: number | null,
    houseId: string | null,
    patternId: string | null,
    ballId: string | null
  ) => {
    setSessionActionError(null);
    setIsEditModalVisible(true);
    setEditingSessionServerId(sessionId);
    setEditingSessionClientSyncId(sessionClientSyncId);
    setEditingSessionDate(date);
    setEditingSessionHouseId(houseId);
    setEditingSessionPatternId(patternId);
    setEditingSessionBallId(ballId);
  };

  const onCreateSession = async () => {
    setSessionError(null);
    const clientSyncId =
      pendingCreateClientSyncId ?? createClientSyncId('session');
    const targetLeagueId =
      leagueId ?? (selectedLeague?._id as LeagueId) ?? null;
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

    // Local-first session writes (C-2): the create goes straight to the
    // SQLite-backed local journal through the converted session hook
    // (`use-sessions.ts` → the app-boundary write adapter). The offline
    // enqueue branch, the `isNavigatorOffline()` guard, the
    // `isRetryableCreateError` re-queue fallback, and the `withTimeout` wrap
    // around the server round-trip are gone: they existed only because the
    // server writes were flaky, and a local write either persisted or threw a
    // domain error that the form reports below. Connectivity is not a mode
    // switch, so an offline device still writes locally. The route pushes the
    // real local session id the create returned, never a `draft-<clientSyncId>`
    // phantom the games screen could not resolve. Validation (league, date,
    // week number) and the UI state transitions are unchanged.
    setIsCreatingSessionRequest(true);

    try {
      if (!targetLeagueId) {
        // The league is known only through a legacy queued draft, so it has no
        // local id to attach a local session to. Already-queued entries stay
        // untouched and no new one is written.
        setSessionError('League is required before creating a session.');
        return;
      }

      const sessionId = await createSession({
        leagueId: targetLeagueId,
        clientSyncId,
        date,
        weekNumber,
        houseId: sessionHouseId as never,
        ballId: sessionBallId as never,
        patternId: sessionPatternId as never,
      });
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
      setPendingCreateClientSyncId(clientSyncId);
      setSessionError(
        caught instanceof Error ? caught.message : 'Unable to create session.'
      );
    } finally {
      setIsCreatingSessionRequest(false);
    }
  };

  const onSaveSessionEdit = async () => {
    if (!editingSessionServerId && !editingSessionClientSyncId) {
      return;
    }

    setSessionActionError(null);
    const date = editingSessionDate.trim();

    if (date.length === 0) {
      setSessionActionError('Session date is required.');
      return;
    }

    // Local-first session writes (C-2): the edit persists straight to SQLite
    // through the converted hook, so there is no queue entry to write and no
    // retryable-server-error fallback. A rejected local update propagates to
    // the form error exactly as the server mutation's rejection did.
    if (!editingSessionServerId) {
      // The session is known only through a legacy queued draft: no local row
      // exists to update. Already-queued entries stay untouched.
      setSessionActionError(
        'Session is required before saving a session edit.'
      );
      return;
    }

    setIsSavingSessionEdit(true);

    try {
      await updateSession({
        sessionId: editingSessionServerId as SessionId,
        date,
        weekNumber: null,
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

  const onDeleteSession = async (target: SessionActionTarget) => {
    setSessionActionError(null);
    const isConfirmed = await confirmDeleteSession(target.date);

    if (!isConfirmed) {
      return;
    }

    // Local-first session deletes (C-2): the delete is a real local delete
    // through the converted hook (adapter → `removeSession` on the SQLite
    // service), so there is no offline enqueue and no retryable-server-error
    // re-queue. The service's foreign-key integrity (NO ACTION) rejects a
    // session that still has games — that rejection surfaces as the form error
    // below instead of queueing an entry that could never drain. The approved
    // scope is the session alone: neither its league nor its games are deleted
    // by this call.
    if (!target.sessionId) {
      // The session is known only through a legacy queued draft: there is no
      // local row to delete. Already-queued entries stay untouched.
      setSessionActionError('Session is required before deleting a session.');
      return;
    }

    setDeletingSessionRowId(target.rowId);

    try {
      await removeSession({ sessionId: target.sessionId as SessionId });

      if (isEditModalVisible) {
        cancelEditingSession();
      }
    } catch (caught) {
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

  return {
    // Create form
    sessionDate,
    setSessionDate,
    sessionWeekNumber,
    setSessionWeekNumber,
    sessionHouseId,
    setSessionHouseId,
    sessionPatternId,
    setSessionPatternId,
    sessionBallId,
    setSessionBallId,
    sessionError,
    setSessionError,
    isCreateModalVisible,
    setIsCreateModalVisible,
    isCreatingSessionRequest,
    pendingCreateClientSyncId,

    // Edit form
    sessionActionError,
    isEditModalVisible,
    editingSessionServerId,
    editingSessionClientSyncId,
    editingSessionDate,
    setEditingSessionDate,
    editingSessionHouseId,
    setEditingSessionHouseId,
    editingSessionPatternId,
    setEditingSessionPatternId,
    editingSessionBallId,
    setEditingSessionBallId,
    isSavingSessionEdit,

    // Action/deletion
    deletingSessionRowId,
    isSessionActionsVisible,
    sessionActionTarget,

    // Handlers
    onCreateSession,
    startEditingSession,
    cancelEditingSession,
    onSaveSessionEdit,
    onDeleteSession,
    closeSessionActions,
    runSessionAction,
    openSessionActions,
    openCreateModal,
  };
}
