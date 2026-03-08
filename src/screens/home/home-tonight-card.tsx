import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LeaguePickerSheet } from './league-picker-sheet';

import type { LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card } from '@/components/ui';
import { useGames, useSessions } from '@/hooks/journal';
import { useHomeLeague } from '@/hooks/journal/use-home-league';
import { buildJournalGamesRouteParams } from '@/screens/journal/journal-route-params';
import {
  findSessionIdForDate,
  formatIsoDateForToday,
  formatIsoDateLabel,
} from '@/screens/journal-fast-lane-utils';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type HomeTonightCardProps = {
  league: {
    _id: string;
    name: string;
    houseName: string | null;
    gamesPerSession: number | null;
  };
  isLoading: boolean;
  onLeaguePickerPress: () => void;
};

export function HomeTonightCard({
  league,
  isLoading,
  onLeaguePickerPress,
}: HomeTonightCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeLeagueId = league._id as LeagueId;
  const { sessions } = useSessions(activeLeagueId);
  const today = formatIsoDateForToday();
  const todaySessionId = useMemo(
    () => findSessionIdForDate(sessions, today),
    [sessions, today]
  );
  const activeSession = useMemo(() => {
    if (todaySessionId) {
      return sessions.find((session) => session._id === todaySessionId) ?? null;
    }
    return sessions[0] ?? null;
  }, [sessions, todaySessionId]);
  const activeSessionId = (activeSession?._id as SessionId | undefined) ?? null;
  const { games, isLoading: isGamesLoading } = useGames(activeSessionId);

  const isComplete = useMemo(() => {
    if (!activeSession || !league.gamesPerSession) return false;
    return games.length >= league.gamesPerSession;
  }, [activeSession, league.gamesPerSession, games.length]);

  const primaryActionLabel = useMemo(() => {
    if (!activeSession) return 'Start tonight';
    if (isComplete) return 'View tonight';
    return 'Continue bowling';
  }, [activeSession, isComplete]);

  const sessionLabel = useMemo(() => {
    if (!activeSession) return 'No session yet';
    const prefix = todaySessionId ? 'Tonight' : 'Most recent';
    return `${prefix} · ${formatIsoDateLabel(activeSession.date)}`;
  }, [activeSession, todaySessionId]);

  const gameCountLabel = useMemo(() => {
    if (!activeSession) return null;
    if (isGamesLoading) return 'Loading...';
    if (league.gamesPerSession) {
      return `Games: ${String(games.length)} / ${String(league.gamesPerSession)}`;
    }
    return `Games: ${String(games.length)}`;
  }, [activeSession, isGamesLoading, games.length, league.gamesPerSession]);

  const handlePrimaryAction = () => {
    if (!activeLeagueId) return;

    if (isComplete || !activeSession) {
      router.push({
        pathname: '/journal/[leagueId]/sessions' as never,
        params: { leagueId: activeLeagueId } as never,
      } as never);
    } else {
      router.push({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
        params: buildJournalGamesRouteParams({
          leagueId: activeLeagueId,
          sessionId: activeSessionId!,
        }) as never,
      } as never);
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Play tonight</Text>

      <Pressable
        onPress={onLeaguePickerPress}
        style={({ pressed }) => [
          styles.leaguePicker,
          pressed ? styles.leaguePickerPressed : null,
        ]}
      >
        <View style={styles.leaguePickerContent}>
          <Text style={styles.leagueName}>{league.name}</Text>
          <Text style={styles.leagueHouse}>
            {league.houseName ?? 'No house set'}
          </Text>
        </View>
        <MaterialIcons
          name="expand-more"
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>

      <Text style={styles.sessionLabel}>{sessionLabel}</Text>
      {gameCountLabel && <Text style={styles.gameCount}>{gameCountLabel}</Text>}

      <Button
        disabled={!activeLeagueId || isLoading}
        label={primaryActionLabel}
        onPress={handlePrimaryAction}
        variant="secondary"
      />
    </Card>
  );
}

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { leagues, activeLeague, isLoading, setHomeLeague, hasLeagues } =
    useHomeLeague();
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  if (!activeLeague && !isLoading) {
    return (
      <ScreenLayout
        title="Home"
        subtitle=""
        hideHeader
        fillCard
        compact
        chromeless
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {hasLeagues ? 'No recent leagues' : 'Welcome!'}
            </Text>
            <Text style={styles.emptyText}>
              {hasLeagues
                ? "You haven't bowled in the last 3 months."
                : 'Open Journal to create your first league.'}
            </Text>
            {hasLeagues ? (
              <>
                <View style={styles.emptyActions}>
                  <View style={styles.emptyActionButton}>
                    <Button
                      label="Go to Journal"
                      onPress={() => router.push('/journal' as never)}
                      variant="secondary"
                    />
                  </View>
                </View>
                <Text style={styles.emptyHint}>
                  Or tap a league below to start a new session.
                </Text>
                <View style={styles.leagueList}>
                  {leagues.map((league) => (
                    <Pressable
                      key={league._id}
                      onPress={() => {
                        setHomeLeague(league._id);
                      }}
                      style={({ pressed }) => [
                        styles.leagueItem,
                        pressed ? styles.leagueItemPressed : null,
                      ]}
                    >
                      <Text style={styles.leagueItemName}>{league.name}</Text>
                      <Text style={styles.leagueItemHouse}>
                        {league.houseName ?? 'No house set'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Button
                label="Open Journal"
                onPress={() => router.push('/journal' as never)}
                variant="secondary"
              />
            )}
          </Card>
        </ScrollView>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout
      title="Home"
      subtitle=""
      hideHeader
      fillCard
      compact
      chromeless
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {activeLeague && (
          <HomeTonightCard
            league={activeLeague}
            isLoading={isLoading}
            onLeaguePickerPress={() => setIsPickerVisible(true)}
          />
        )}
      </ScrollView>

      <LeaguePickerSheet
        leagues={leagues}
        selectedLeagueId={activeLeague?._id ?? null}
        visible={isPickerVisible}
        onClose={() => setIsPickerVisible(false)}
        onSelect={(leagueId: string) => {
          setHomeLeague(leagueId);
          setIsPickerVisible(false);
        }}
      />
    </ScreenLayout>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
    },
    card: {
      gap: spacing.md,
    },
    cardTitle: {
      fontSize: typeScale.title,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    leaguePicker: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
    },
    leaguePickerPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    leaguePickerContent: {
      flex: 1,
    },
    leagueName: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    leagueHouse: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    sessionLabel: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
    },
    gameCount: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
    emptyCard: {
      gap: spacing.md,
      alignItems: 'center',
      padding: spacing.xl,
    },
    emptyTitle: {
      fontSize: typeScale.title,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    emptyText: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    emptyActions: {
      flexDirection: 'row',
      gap: spacing.xs,
      width: '100%',
    },
    emptyActionButton: {
      flex: 1,
    },
    emptyHint: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    leagueList: {
      width: '100%',
      gap: spacing.xs,
    },
    leagueItem: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.xs,
      backgroundColor: colors.surface,
    },
    leagueItemPressed: {
      backgroundColor: colors.accentMuted,
    },
    leagueItemName: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    leagueItemHouse: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
  });
