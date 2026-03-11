import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { SessionList } from './journal/components/session-list';
import { SessionModalsPanel } from './journal/components/session-modals-panel';
import { getFirstParam } from './journal/journal-route-params';
import { getCreateModalTranslateY } from './journal/modal-layout-utils';
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
  const defaultSessionHouseId = selectedLeague?.houseId
    ? String(selectedLeague.houseId)
    : null;
  const canCreateSessionTarget = Boolean(
    leagueId || leagueClientSyncId || selectedLeague
  );

  const {
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
    sessionActionError,
    isEditModalVisible,
    editingSessionDate,
    setEditingSessionDate,
    editingSessionWeekNumber,
    setEditingSessionWeekNumber,
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
          isSessionsLoading={isSessionsLoading}
          isLeagueGamesLoading={isLeagueGamesLoading}
          displaySessions={displaySessions}
          deletingSessionRowId={deletingSessionRowId}
          derivedWeekNumberBySessionId={derivedWeekNumberBySessionId}
          sessionActionError={sessionActionError}
          seasonSummary={seasonSummary}
          openSessionActions={openSessionActions}
          router={router}
        />

        <FloatingActionButton
          accessibilityLabel="Create session"
          disabled={!canCreateSessionTarget}
          onPress={openCreateModal}
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
          sessionWeekNumber={sessionWeekNumber}
          sessionHouseId={sessionHouseId}
          sessionPatternId={sessionPatternId}
          sessionBallId={sessionBallId}
          sessionError={sessionError}
          onCloseCreate={() => setIsCreateModalVisible(false)}
          onSubmitCreate={onCreateSession}
          onSessionDateChange={setSessionDate}
          onSessionWeekNumberChange={setSessionWeekNumber}
          onSessionHouseSelect={(option) => setSessionHouseId(option.id)}
          onSessionPatternSelect={(option) => setSessionPatternId(option.id)}
          onSessionBallSelect={(option) => setSessionBallId(option.id)}
          isEditModalVisible={isEditModalVisible}
          isSavingSessionEdit={isSavingSessionEdit}
          editingSessionDate={editingSessionDate}
          editingSessionWeekNumber={editingSessionWeekNumber}
          editingSessionHouseId={editingSessionHouseId}
          editingSessionPatternId={editingSessionPatternId}
          editingSessionBallId={editingSessionBallId}
          sessionActionError={sessionActionError}
          onCloseEdit={cancelEditingSession}
          onSubmitEdit={() => {
            void onSaveSessionEdit();
          }}
          onEditSessionDateChange={setEditingSessionDate}
          onEditSessionWeekNumberChange={setEditingSessionWeekNumber}
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
