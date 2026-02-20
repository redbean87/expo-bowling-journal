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
  findSessionIdForDate,
  formatIsoDateLabel,
  formatIsoDateForToday,
  formatSessionWeekLabel,
} from './journal-fast-lane-utils';

import type { LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card, Input } from '@/components/ui';
import { useLeagues, useSessions } from '@/hooks/journal';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

function getFirstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default function JournalSessionsScreen() {
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
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(
    null
  );
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionDate, setEditingSessionDate] = useState('');
  const [editingSessionWeekNumber, setEditingSessionWeekNumber] = useState('');
  const [isSavingSessionEdit, setIsSavingSessionEdit] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null
  );
  const hasHandledStartTonightRef = useRef(false);

  const leagueName = useMemo(() => {
    if (!leagueId) {
      return null;
    }

    return leagues.find((league) => league._id === leagueId)?.name ?? null;
  }, [leagueId, leagues]);

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
      });
      setSessionWeekNumber('');
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
    weekNumber: number | null
  ) => {
    setSessionActionError(null);
    setEditingSessionId(sessionId);
    setEditingSessionDate(date);
    setEditingSessionWeekNumber(weekNumber === null ? '' : String(weekNumber));
  };

  const cancelEditingSession = () => {
    setEditingSessionId(null);
    setEditingSessionDate('');
    setEditingSessionWeekNumber('');
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <View style={styles.createSection}>
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
          {sessionError ? (
            <Text style={styles.errorText}>{sessionError}</Text>
          ) : null}
          <Button
            disabled={isCreatingSession || !leagueId}
            label={isCreatingSession ? 'Creating...' : 'Create session'}
            onPress={onCreateSession}
          />
        </View>

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
            No sessions yet. Create one to continue.
          </Text>
        ) : null}

        {sessions.map((session) => (
          <Card key={session._id} style={styles.rowCard}>
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
                    session.weekNumber ?? null
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
                onPress={() => void onDeleteSession(session._id, session.date)}
                style={({ pressed }) => [
                  styles.linkAction,
                  pressed ? styles.linkActionPressed : null,
                ]}
              >
                <Text style={styles.deleteLabel}>
                  {deletingSessionId === session._id ? 'Deleting...' : 'Delete'}
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
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  errorText: {
    fontSize: typeScale.bodySm,
    color: colors.danger,
  },
  createSection: {
    gap: spacing.sm,
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
});
