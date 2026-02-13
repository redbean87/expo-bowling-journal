import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { LeagueId } from '@/services/journal';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { useLeagues, useSessions } from '@/hooks/journal';
import { colors } from '@/theme/tokens';

function getFirstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default function JournalSessionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ leagueId?: string | string[] }>();
  const leagueId = getFirstParam(params.leagueId) as LeagueId | null;
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

  return (
    <PlaceholderScreen
      title="Sessions"
      subtitle={
        leagueName ? `League: ${leagueName}` : 'Review and create sessions.'
      }
      fillCard
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.formCard}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSessionDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={sessionDate}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            onChangeText={setSessionWeekNumber}
            placeholder="Week number (optional)"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={sessionWeekNumber}
          />
          {sessionError ? (
            <Text style={styles.errorText}>{sessionError}</Text>
          ) : null}
          <Pressable
            disabled={isCreatingSession || !leagueId}
            onPress={onCreateSession}
            style={[
              styles.actionButton,
              isCreatingSession || !leagueId
                ? styles.actionButtonDisabled
                : null,
            ]}
          >
            <Text style={styles.actionButtonLabel}>
              {isCreatingSession ? 'Creating...' : 'Create session'}
            </Text>
          </Pressable>
        </View>

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
          <Pressable
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
            style={styles.row}
          >
            <Text style={styles.rowTitle}>Date: {session.date}</Text>
            <Text style={styles.meta}>
              Week {session.weekNumber ?? 'not set'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 8,
  },
  scroll: {
    flex: 1,
  },
  formCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#F8FAFF',
  },
  input: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#B42318',
  },
  actionButton: {
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  row: {
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.surface,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
