import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { SessionList } from './journal/components/session-list';
import { SessionModalsPanel } from './journal/components/session-modals-panel';
import {
  getFirstParam,
  buildJournalGamesRouteParams,
} from './journal/journal-route-params';
import { getCreateModalTranslateY } from './journal/modal-layout-utils';
import { formatIsoDateForToday } from './journal-fast-lane-utils';
import {
  buildSessionNightSummary,
  normalizeGamesPerSession,
} from './journal-games-night-summary';

import type { LeagueId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { FloatingActionButton } from '@/components/ui';
import {
  useLeagueGames,
  useLeagues,
  useReferenceData,
  useSessions,
  useSessionMutations,
  useSessionQueue,
  useSessionRouteSync,
  useStartTonight,
} from '@/hooks/journal';
import { usePreferences } from '@/providers/preferences-provider';
import { resolveLeagueType } from '@/utils/league-type-utils';

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
  const { leagues } = useLeagues();
  const {
    sessions,
    isLoading: isSessionsLoading,
    createSession,
    updateSession,
    removeSession,
    isCreating: isCreatingSession,
  } = useSessions(leagueId);
  const { games: leagueGames, isLoading: isLeagueGamesLoading } =
    useLeagueGames(leagueId);

  const {
    setQueuedSessionCreates,
    draftLeagueName,
    syncMap,
    displaySessions,
    derivedWeekNumberBySessionId,
    getNextSessionWeekNumber,
    suggestedSessionWeekNumber,
    refreshQueuedSessionCreates,
  } = useSessionQueue({ leagueId, leagueClientSyncId, sessions });
  const modalTranslateY = getCreateModalTranslateY(windowWidth);

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

  const seasonSummary = useMemo(
    () =>
      buildSessionNightSummary(
        leagueGames,
        normalizeGamesPerSession(selectedLeague?.gamesPerSession)
      ),
    [leagueGames, selectedLeague?.gamesPerSession]
  );

  const leagueName = selectedLeague?.name ?? draftLeagueName;
  const leagueType = useMemo(
    () => resolveLeagueType(selectedLeague ?? {}),
    [selectedLeague]
  );
  const defaultSessionHouseId = selectedLeague?.houseId
    ? String(selectedLeague.houseId)
    : null;
  const canCreateSessionTarget = Boolean(
    leagueId || leagueClientSyncId || selectedLeague
  );

  const {
    sessionDate,
    setSessionDate,
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
    sessionActionError,
    isEditModalVisible,
    editingSessionDate,
    setEditingSessionDate,
    editingSessionHouseId,
    setEditingSessionHouseId,
    editingSessionPatternId,
    setEditingSessionPatternId,
    editingSessionBallId,
    setEditingSessionBallId,
    isSavingSessionEdit,
    deletingSessionRowId,
    isSessionActionsVisible,
    sessionActionTarget,
    onCreateSession,
    cancelEditingSession,
    onSaveSessionEdit,
    closeSessionActions,
    runSessionAction,
    openSessionActions,
    openCreateModal,
  } = useSessionMutations({
    leagueId,
    leagueClientSyncId,
    selectedLeague,
    createSession,
    updateSession,
    removeSession,
    refreshQueuedSessionCreates,
    getNextSessionWeekNumber,
    suggestedSessionWeekNumber,
    defaultSessionHouseId,
    setQueuedSessionCreates,
    router,
  });

  const shouldLoadReferenceData = isCreateModalVisible || isEditModalVisible;
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

  useSessionRouteSync({
    isFocused,
    leagueId,
    leagueClientSyncId,
    syncMap,
    selectedLeague,
    leagueName,
    navigation,
    router,
  });

  useStartTonight({
    isFocused,
    startTonight,
    leagueId,
    rawLeagueId,
    leagueClientSyncId,
    isSessionsLoading,
    isCreatingSession,
    displaySessions,
    createSession,
    refreshQueuedSessionCreates,
    router,
    onError: setSessionError,
  });

  const { quickEntryMode } = usePreferences();

  const handleQuickCreateSession = useCallback(async () => {
    if (!leagueId) {
      openCreateModal();
      return;
    }

    const today = formatIsoDateForToday();

    try {
      const sessionId = await createSession({ leagueId, date: today });
      router.push({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
        params: buildJournalGamesRouteParams({
          leagueId: rawLeagueId ?? leagueId,
          sessionId,
          leagueClientSyncId,
          sessionDate: today,
        }) as never,
      } as never);
    } catch {
      setSessionError('Unable to create session.');
    }
  }, [
    leagueId,
    rawLeagueId,
    leagueClientSyncId,
    createSession,
    openCreateModal,
    router,
    setSessionError,
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
      <View style={screenBodyStyle}>
        <SessionList
          leagueId={leagueId}
          leagueClientSyncId={leagueClientSyncId}
          _leagueType={leagueType}
          isSessionsLoading={isSessionsLoading}
          isLeagueGamesLoading={isLeagueGamesLoading}
          displaySessions={displaySessions}
          deletingSessionRowId={deletingSessionRowId}
          _derivedWeekNumberBySessionId={derivedWeekNumberBySessionId}
          sessionActionError={sessionActionError}
          seasonSummary={seasonSummary}
          openSessionActions={openSessionActions}
          router={router}
        />

        <FloatingActionButton
          accessibilityLabel="Create session"
          disabled={!canCreateSessionTarget}
          onPress={
            quickEntryMode
              ? () => void handleQuickCreateSession()
              : openCreateModal
          }
        />

        <SessionModalsPanel
          modalTranslateY={modalTranslateY}
          canCreateSessionTarget={canCreateSessionTarget}
          isSessionActionsVisible={isSessionActionsVisible}
          sessionActionTarget={sessionActionTarget}
          onCloseActions={closeSessionActions}
          onRunAction={runSessionAction}
          ballOptions={ballOptions}
          recentBallOptions={recentBallOptions}
          patternOptions={patternOptions}
          recentPatternOptions={recentPatternOptions}
          houseOptions={houseOptions}
          recentHouseOptions={recentHouseOptions}
          buildSuggestions={buildSuggestions}
          createBall={createBall}
          createPattern={createPattern}
          createHouse={createHouse}
          isCreateModalVisible={isCreateModalVisible}
          isCreatingSessionRequest={isCreatingSessionRequest}
          sessionDate={sessionDate}
          sessionHouseId={sessionHouseId}
          sessionPatternId={sessionPatternId}
          sessionBallId={sessionBallId}
          sessionError={sessionError}
          onCloseCreate={() => setIsCreateModalVisible(false)}
          onSubmitCreate={onCreateSession}
          onSessionDateChange={setSessionDate}
          onSessionHouseSelect={(option) => setSessionHouseId(option.id)}
          onSessionPatternSelect={(option) => setSessionPatternId(option.id)}
          onSessionBallSelect={(option) => setSessionBallId(option.id)}
          isEditModalVisible={isEditModalVisible}
          isSavingSessionEdit={isSavingSessionEdit}
          editingSessionDate={editingSessionDate}
          editingSessionHouseId={editingSessionHouseId}
          editingSessionPatternId={editingSessionPatternId}
          editingSessionBallId={editingSessionBallId}
          sessionActionError={sessionActionError}
          onCloseEdit={cancelEditingSession}
          onSubmitEdit={() => {
            void onSaveSessionEdit();
          }}
          onEditSessionDateChange={setEditingSessionDate}
          onEditSessionHouseSelect={(option) =>
            setEditingSessionHouseId(option.id)
          }
          onEditSessionPatternSelect={(option) =>
            setEditingSessionPatternId(option.id)
          }
          onEditSessionBallSelect={(option) =>
            setEditingSessionBallId(option.id)
          }
        />
      </View>
    </ScreenLayout>
  );
}

const screenBodyStyle = StyleSheet.create({ root: { flex: 1 } }).root;
