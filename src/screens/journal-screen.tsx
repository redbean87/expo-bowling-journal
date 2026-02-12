import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { useGames, useLeagues, useSessions } from '@/hooks/journal';
import { colors } from '@/theme/tokens';

export default function JournalScreen() {
  const router = useRouter();
  const {
    leagues,
    isLoading: isLeaguesLoading,
    isAuthenticated,
    createLeague,
    isCreating: isCreatingLeague,
  } = useLeagues();
  const [leagueName, setLeagueName] = useState('');
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [selectedLeagueOverride, setSelectedLeagueOverride] = useState<
    string | null
  >(null);

  const selectedLeagueId = useMemo(() => {
    if (leagues.length === 0) {
      return null;
    }

    const selectedLeague = leagues.find(
      (league) => league._id === selectedLeagueOverride
    );

    return selectedLeague?._id ?? leagues[0]._id;
  }, [leagues, selectedLeagueOverride]);

  const {
    sessions,
    isLoading: isSessionsLoading,
    createSession,
    isCreating: isCreatingSession,
  } = useSessions(selectedLeagueId);
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [sessionWeekNumber, setSessionWeekNumber] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedSessionOverride, setSelectedSessionOverride] = useState<
    string | null
  >(null);

  const selectedSessionId = useMemo(() => {
    if (sessions.length === 0) {
      return null;
    }

    const selectedSession = sessions.find(
      (session) => session._id === selectedSessionOverride
    );

    return selectedSession?._id ?? sessions[0]._id;
  }, [sessions, selectedSessionOverride]);

  const { games, isLoading: isGamesLoading } = useGames(selectedSessionId);

  const onCreateLeague = async () => {
    setLeagueError(null);
    const name = leagueName.trim();

    if (name.length === 0) {
      setLeagueError('League name is required.');
      return;
    }

    try {
      const leagueId = await createLeague({ name });
      setLeagueName('');
      setSelectedLeagueOverride(leagueId);
      setSelectedSessionOverride(null);
    } catch (caught) {
      setLeagueError(
        caught instanceof Error ? caught.message : 'Unable to create league.'
      );
    }
  };

  const onCreateSession = async () => {
    setSessionError(null);

    if (!selectedLeagueId) {
      setSessionError('Pick a league before creating a session.');
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
        leagueId: selectedLeagueId,
        date,
        weekNumber,
      });
      setSessionWeekNumber('');
      setSelectedSessionOverride(sessionId);
    } catch (caught) {
      setSessionError(
        caught instanceof Error ? caught.message : 'Unable to create session.'
      );
    }
  };

  return (
    <PlaceholderScreen
      title="Journal"
      subtitle="Live data is now wired. Select a league and session to browse games."
      fillCard
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Live data syncs automatically. If you just added records, pull to
          refresh or revisit this tab.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Leagues</Text>
          {isAuthenticated ? (
            <View style={styles.formCard}>
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={setLeagueName}
                placeholder="League name"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                value={leagueName}
              />
              {leagueError ? (
                <Text style={styles.errorText}>{leagueError}</Text>
              ) : null}
              <Pressable
                disabled={isCreatingLeague}
                onPress={onCreateLeague}
                style={[
                  styles.actionButton,
                  isCreatingLeague ? styles.actionButtonDisabled : null,
                ]}
              >
                <Text style={styles.actionButtonLabel}>
                  {isCreatingLeague ? 'Creating...' : 'Create league'}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {isLeaguesLoading ? (
            <Text style={styles.meta}>Loading leagues...</Text>
          ) : null}
          {!isLeaguesLoading && !isAuthenticated ? (
            <Text style={styles.meta}>
              Sign in from Home to load your leagues.
            </Text>
          ) : null}
          {!isLeaguesLoading && isAuthenticated && leagues.length === 0 ? (
            <Text style={styles.meta}>
              No leagues yet. Create your first league to get started.
            </Text>
          ) : null}
          {leagues.map((league) => (
            <Pressable
              key={league._id}
              onPress={() => {
                setSelectedLeagueOverride(league._id);
                setSelectedSessionOverride(null);
              }}
              style={[
                styles.row,
                selectedLeagueId === league._id ? styles.rowSelected : null,
              ]}
            >
              <Text style={styles.rowTitle}>{league.name}</Text>
              <Text style={styles.meta}>
                {league.houseName ?? 'No house set'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sessions</Text>
          {isAuthenticated && selectedLeagueId !== null ? (
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
                disabled={isCreatingSession}
                onPress={onCreateSession}
                style={[
                  styles.actionButton,
                  isCreatingSession ? styles.actionButtonDisabled : null,
                ]}
              >
                <Text style={styles.actionButtonLabel}>
                  {isCreatingSession ? 'Creating...' : 'Create session'}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {isSessionsLoading ? (
            <Text style={styles.meta}>Loading sessions...</Text>
          ) : null}
          {!isSessionsLoading && selectedLeagueId === null ? (
            <Text style={styles.meta}>Pick a league to view sessions.</Text>
          ) : null}
          {!isSessionsLoading &&
          selectedLeagueId !== null &&
          sessions.length === 0 ? (
            <Text style={styles.meta}>No sessions yet. Create one above.</Text>
          ) : null}
          {sessions.map((session) => (
            <Pressable
              key={session._id}
              onPress={() => setSelectedSessionOverride(session._id)}
              style={[
                styles.row,
                selectedSessionId === session._id ? styles.rowSelected : null,
              ]}
            >
              <Text style={styles.rowTitle}>Date: {session.date}</Text>
              <Text style={styles.meta}>
                Week {session.weekNumber ?? 'not set'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Games</Text>
          {selectedSessionId !== null ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/game/[gameId]' as never,
                  params: {
                    gameId: 'new',
                    sessionId: selectedSessionId,
                  } as never,
                })
              }
              style={styles.actionButton}
            >
              <Text style={styles.actionButtonLabel}>Add game</Text>
            </Pressable>
          ) : null}
          {isGamesLoading ? (
            <Text style={styles.meta}>Loading games...</Text>
          ) : null}
          {!isGamesLoading && selectedSessionId === null ? (
            <Text style={styles.meta}>Pick a session to view games.</Text>
          ) : null}
          {!isGamesLoading &&
          selectedSessionId !== null &&
          games.length === 0 ? (
            <Text style={styles.meta}>No games in this session yet.</Text>
          ) : null}
          {games.map((game) => (
            <View key={game._id} style={styles.row}>
              <Text style={styles.rowTitle}>{game.date}</Text>
              <Text style={styles.meta}>Score {game.totalScore}</Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/game/[gameId]' as never,
                    params: { gameId: game._id } as never,
                  })
                }
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonLabel}>Edit game</Text>
              </Pressable>
            </View>
          ))}
        </View>
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
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  row: {
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.surface,
  },
  rowSelected: {
    borderColor: colors.accent,
    backgroundColor: '#EEF4FF',
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
  secondaryButton: {
    marginTop: 4,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
});
