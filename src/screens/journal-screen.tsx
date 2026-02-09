import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { useGames, useLeagues, useSessions } from '@/hooks/journal';
import { colors } from '@/theme/tokens';

export default function JournalScreen() {
  const {
    leagues,
    isLoading: isLeaguesLoading,
    isAuthenticated,
  } = useLeagues();
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

  const { sessions, isLoading: isSessionsLoading } =
    useSessions(selectedLeagueId);
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

  return (
    <PlaceholderScreen
      title="Journal"
      subtitle="Live data is now wired. Select a league and session to browse games."
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Live data syncs automatically. If you just added records, pull to
          refresh or revisit this tab.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Leagues</Text>
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
              No leagues yet. Create one in upcoming flows.
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
          {isSessionsLoading ? (
            <Text style={styles.meta}>Loading sessions...</Text>
          ) : null}
          {!isSessionsLoading && selectedLeagueId === null ? (
            <Text style={styles.meta}>Pick a league to view sessions.</Text>
          ) : null}
          {!isSessionsLoading &&
          selectedLeagueId !== null &&
          sessions.length === 0 ? (
            <Text style={styles.meta}>No sessions in this league yet.</Text>
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
});
