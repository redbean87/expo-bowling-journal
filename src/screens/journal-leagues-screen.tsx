import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card, Input } from '@/components/ui';
import { useLeagues } from '@/hooks/journal';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

export default function JournalLeaguesScreen() {
  const router = useRouter();
  const {
    leagues,
    isLoading: isLeaguesLoading,
    createLeague,
    isCreating: isCreatingLeague,
  } = useLeagues();
  const [leagueName, setLeagueName] = useState('');
  const [leagueGamesPerSession, setLeagueGamesPerSession] = useState('');
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const defaultLeagueId = leagues[0]?._id ?? null;

  const navigateToLeagueSessions = (leagueId: string) => {
    router.push({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: { leagueId } as never,
    } as never);
  };

  const startLeagueNight = (leagueId: string) => {
    router.push({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: {
        leagueId,
        startTonight: '1',
      } as never,
    } as never);
  };

  const onCreateLeague = async () => {
    setLeagueError(null);
    const name = leagueName.trim();

    if (name.length === 0) {
      setLeagueError('League name is required.');
      return;
    }

    let gamesPerSession: number | null | undefined = undefined;
    const targetGamesInput = leagueGamesPerSession.trim();

    if (targetGamesInput.length > 0) {
      const parsed = Number(targetGamesInput);

      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
        setLeagueError(
          'Games per session must be a whole number from 1 to 12.'
        );
        return;
      }

      gamesPerSession = parsed;
    }

    try {
      const leagueId = await createLeague({ name, gamesPerSession });
      setLeagueName('');
      setLeagueGamesPerSession('');
      router.push({
        pathname: '/journal/[leagueId]/sessions' as never,
        params: { leagueId } as never,
      } as never);
    } catch (caught) {
      setLeagueError(
        caught instanceof Error ? caught.message : 'Unable to create league.'
      );
    }
  };

  return (
    <ScreenLayout
      title="Journal"
      subtitle="Start with a league, then drill into sessions and games."
      fillCard
      hideHeader
      compact
      chromeless
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Card muted>
          <Input
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setLeagueName}
            placeholder="League name"
            value={leagueName}
          />
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            onChangeText={setLeagueGamesPerSession}
            placeholder="Games per session (optional)"
            value={leagueGamesPerSession}
          />
          {leagueError ? (
            <Text style={styles.errorText}>{leagueError}</Text>
          ) : null}
          <Button
            disabled={isCreatingLeague}
            label={isCreatingLeague ? 'Creating...' : 'Create league'}
            onPress={onCreateLeague}
          />
        </Card>

        {isLeaguesLoading ? (
          <Text style={styles.meta}>Loading leagues...</Text>
        ) : null}
        {!isLeaguesLoading && leagues.length === 0 ? (
          <Text style={styles.meta}>
            No leagues yet. Create your first league to get started.
          </Text>
        ) : null}

        <Button
          disabled={!defaultLeagueId || isLeaguesLoading}
          label="Continue tonight"
          onPress={() => {
            if (!defaultLeagueId) {
              return;
            }

            startLeagueNight(defaultLeagueId);
          }}
        />

        {leagues.map((league) => (
          <Card key={league._id}>
            <Pressable
              onPress={() => navigateToLeagueSessions(league._id)}
              style={({ pressed }) => [
                styles.leagueContent,
                pressed ? styles.leagueContentPressed : null,
              ]}
            >
              <Text style={styles.rowTitle}>{league.name}</Text>
              <Text style={styles.meta}>
                {league.houseName ?? 'No house set'}
              </Text>
              <Text style={styles.meta}>
                Target games: {league.gamesPerSession ?? 'Not set'}
              </Text>
            </Pressable>

            <View style={styles.rowActions}>
              <Button
                label="Quick start"
                onPress={() => startLeagueNight(league._id)}
                variant="ghost"
              />
            </View>
          </Card>
        ))}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
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
  leagueContent: {
    gap: spacing.xs,
  },
  leagueContentPressed: {
    opacity: 0.82,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  meta: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
});
