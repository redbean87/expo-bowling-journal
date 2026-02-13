import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LeagueId, SessionId } from '@/services/journal';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { useGames } from '@/hooks/journal';
import { colors } from '@/theme/tokens';

function getFirstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default function JournalGamesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    leagueId?: string | string[];
    sessionId?: string | string[];
  }>();
  const leagueId = getFirstParam(params.leagueId) as LeagueId | null;
  const sessionId = getFirstParam(params.sessionId) as SessionId | null;
  const { games, isLoading: isGamesLoading } = useGames(sessionId);

  return (
    <PlaceholderScreen
      title="Games"
      subtitle="Review games for this session, then add or edit frame data."
      fillCard
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Pressable
          disabled={!leagueId || !sessionId}
          onPress={() =>
            router.push({
              pathname:
                '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
              params: {
                leagueId: leagueId ?? '',
                sessionId: sessionId ?? '',
                gameId: 'new',
              },
            })
          }
          style={[
            styles.actionButton,
            !leagueId || !sessionId ? styles.actionButtonDisabled : null,
          ]}
        >
          <Text style={styles.actionButtonLabel}>Add game</Text>
        </Pressable>

        {isGamesLoading ? (
          <Text style={styles.meta}>Loading games...</Text>
        ) : null}
        {!isGamesLoading && !sessionId ? (
          <Text style={styles.meta}>Session not found.</Text>
        ) : null}
        {!isGamesLoading && sessionId && games.length === 0 ? (
          <Text style={styles.meta}>No games in this session yet.</Text>
        ) : null}

        {games.map((game) => (
          <View key={game._id} style={styles.row}>
            <Text style={styles.rowTitle}>{game.date}</Text>
            <Text style={styles.meta}>Score {game.totalScore}</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname:
                    '/journal/[leagueId]/sessions/[sessionId]/games/[gameId]',
                  params: {
                    leagueId: leagueId ?? '',
                    sessionId: sessionId ?? '',
                    gameId: game._id,
                  },
                })
              }
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonLabel}>Edit game</Text>
            </Pressable>
          </View>
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
