import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
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

function getFirstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default function JournalSessionsScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{
    leagueId?: string | string[];
    startTonight?: string | string[];
  }>();
  const leagueId = getFirstParam(params.leagueId) as LeagueId | null;
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
  const hasHandledStartTonightRef = useRef(false);
  const modalTranslateY = getCreateModalTranslateY(windowWidth);
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
  } = useReferenceData();

  const selectedLeague = useMemo(() => {
    if (!leagueId) {
      return null;
    }

    return leagues.find((league) => league._id === leagueId) ?? null;
  }, [leagueId, leagues]);
  const leagueName = selectedLeague?.name ?? null;
  const defaultSessionHouseId = selectedLeague?.houseId
    ? String(selectedLeague.houseId)
    : null;

  const derivedWeekNumberBySessionId = useMemo(() => {
    const oldestFirstSessions = [...sessions].reverse();

    return new Map(
      oldestFirstSessions.map((session, index) => [session._id, index + 1])
    );
  }, [sessions]);

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

    if (!leagueId) {
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

    try {
      const sessionId = await createSession({
        leagueId,
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
      router.push({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
        params: { leagueId, sessionId } as never,
      } as never);
    } catch (caught) {
      setSessionError(
        caught instanceof Error ? caught.message : 'Unable to create session.'
      );
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

  const openCreateModal = () => {
    setSessionError(null);
    setSessionHouseId(defaultSessionHouseId);
    setIsCreateModalVisible(true);
  };

  useEffect(() => {
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
          {!isSessionsLoading && !leagueId ? (
            <Text style={styles.meta}>League not found.</Text>
          ) : null}
          {!isSessionsLoading && leagueId && sessions.length === 0 ? (
            <Text style={styles.meta}>
              No sessions yet. Tap + to create one.
            </Text>
          ) : null}

          {sessions.map((session) => (
            <Card
              key={session._id}
              style={[
                styles.rowCard,
                editingSessionId === session._id ? styles.rowCardActive : null,
              ]}
            >
              <Pressable
                style={({ pressed }) => [pressed ? styles.rowPressed : null]}
                onPress={() =>
                  router.push({
                    pathname:
                      '/journal/[leagueId]/sessions/[sessionId]/games' as never,
                    params: {
                      leagueId: leagueId ?? '',
                      sessionId: session._id,
                    } as never,
                  } as never)
                }
              >
                <Text style={styles.rowTitle}>
                  {formatSessionWeekLabel(
                    session.weekNumber ??
                      derivedWeekNumberBySessionId.get(session._id) ??
                      1
                  )}
                </Text>
                <Text style={styles.meta}>
                  {formatIsoDateLabel(session.date)}
                </Text>
              </Pressable>

              <View style={styles.rowActions}>
                <Pressable
                  onPress={() =>
                    startEditingSession(
                      session._id,
                      session.date,
                      session.weekNumber ?? null,
                      session.houseId ? String(session.houseId) : null,
                      session.patternId ? String(session.patternId) : null,
                      session.ballId ? String(session.ballId) : null
                    )
                  }
                  style={({ pressed }) => [
                    styles.linkAction,
                    pressed ? styles.linkActionPressed : null,
                  ]}
                >
                  <Text style={styles.linkActionLabel}>Edit</Text>
                </Pressable>
                <Pressable
                  disabled={deletingSessionId === session._id}
                  onPress={() =>
                    void onDeleteSession(session._id, session.date)
                  }
                  style={({ pressed }) => [
                    styles.linkAction,
                    pressed ? styles.linkActionPressed : null,
                  ]}
                >
                  <Text style={styles.deleteLabel}>
                    {deletingSessionId === session._id
                      ? 'Deleting...'
                      : 'Delete'}
                  </Text>
                </Pressable>
              </View>

              {editingSessionId === session._id ? (
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
          disabled={!leagueId}
          onPress={openCreateModal}
        />

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
                    disabled={isCreatingSession || !leagueId}
                    label={isCreatingSession ? 'Creating...' : 'Create'}
                    onPress={onCreateSession}
                    variant="secondary"
                  />
                </View>
                <View style={styles.modalActionButton}>
                  <Button
                    disabled={isCreatingSession}
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
  linkActionLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: 'rgba(27, 110, 243, 0.9)',
  },
  deleteLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.danger,
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
});
