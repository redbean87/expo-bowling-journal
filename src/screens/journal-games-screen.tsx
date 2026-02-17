import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { buildSessionNightSummary } from './journal-games-night-summary';

import type { LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card } from '@/components/ui';
import { useGames, useLeagues } from '@/hooks/journal';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

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
  const { leagues } = useLeagues();

  const league = useMemo(() => {
    if (!leagueId) {
      return null;
    }

    return leagues.find((candidate) => candidate._id === leagueId) ?? null;
  }, [leagueId, leagues]);

  const nightSummary = useMemo(
    () => buildSessionNightSummary(games, league?.gamesPerSession),
    [games, league?.gamesPerSession]
  );
  const addGameLabel = nightSummary.isNightComplete
    ? 'Add extra game'
    : 'Add game';

  return (
    <ScreenLayout
      title="Games"
      subtitle="Review games for this session, then add or edit frame data."
      fillCard
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Button
          disabled={!leagueId || !sessionId}
          label={addGameLabel}
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
        />

        {sessionId ? (
          <Card muted>
            <Text style={styles.summaryTitle}>Night progress</Text>
            <Text style={styles.meta}>
              {nightSummary.targetGames === null
                ? `Games: ${String(nightSummary.gamesPlayed)}`
                : `Games: ${String(nightSummary.gamesPlayed)} / ${String(nightSummary.targetGames)}`}
            </Text>
            {nightSummary.targetGames !== null ? (
              <Text style={styles.meta}>
                {nightSummary.isNightComplete
                  ? 'Night complete. Add extra game anytime.'
                  : `${String(nightSummary.remainingGames ?? 0)} game${
                      nightSummary.remainingGames === 1 ? '' : 's'
                    } remaining`}
              </Text>
            ) : (
              <Text style={styles.meta}>
                Set a league game target to track completion.
              </Text>
            )}
            {nightSummary.gamesPlayed > 0 ? (
              <>
                <Text style={styles.summaryTitle}>Night stats</Text>
                <Text style={styles.meta}>
                  Series: {nightSummary.totalPins}
                </Text>
                <Text style={styles.meta}>
                  Average: {nightSummary.average.toFixed(2)}
                </Text>
                <Text style={styles.meta}>
                  High game: {nightSummary.highGame ?? '-'}
                </Text>
                <Text style={styles.meta}>
                  Low game: {nightSummary.lowGame ?? '-'}
                </Text>
                <Text style={styles.meta}>
                  Strikes {nightSummary.strikes} | Spares {nightSummary.spares}{' '}
                  | Opens {nightSummary.opens}
                </Text>
              </>
            ) : null}
          </Card>
        ) : null}

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
          <Card key={game._id}>
            <Text style={styles.rowTitle}>{game.date}</Text>
            <Text style={styles.meta}>Score {game.totalScore}</Text>
            <Button
              label="Edit game"
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
              variant="secondary"
            />
          </Card>
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
  summaryTitle: {
    fontSize: typeScale.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
