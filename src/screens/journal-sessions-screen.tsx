import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import {
  findSessionIdForDate,
  formatIsoDateForToday,
} from './journal-fast-lane-utils';

import type { LeagueId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card, Input, PressableCard } from '@/components/ui';
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
    isCreating: isCreatingSession,
  } = useSessions(leagueId);

  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [sessionWeekNumber, setSessionWeekNumber] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const hasHandledStartTonightRef = useRef(false);

  const leagueName = useMemo(() => {
    if (!leagueId) {
      return null;
    }

    return leagues.find((league) => league._id === leagueId)?.name ?? null;
  }, [leagueId, leagues]);

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
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card muted>
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
        </Card>

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
          <PressableCard
            key={session._id}
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
            <Text style={styles.rowTitle}>Date: {session.date}</Text>
            <Text style={styles.meta}>
              Week {session.weekNumber ?? 'not set'}
            </Text>
          </PressableCard>
        ))}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
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
  meta: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
});
