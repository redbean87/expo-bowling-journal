import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card } from '@/components/ui';
import { useGames, useLeagues, useSessions } from '@/hooks/journal';
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

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { leagues, isLoading: isLeaguesLoading } = useLeagues();
  const activeLeague = leagues[0] ?? null;
  const activeLeagueId = (activeLeague?._id as LeagueId | undefined) ?? null;
  const { sessions, isLoading: isSessionsLoading } =
    useSessions(activeLeagueId);
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

  const openSessions = (leagueId: string, startTonight: boolean) => {
    router.push({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: startTonight
        ? ({ leagueId, startTonight: '1' } as never)
        : ({ leagueId } as never),
    } as never);
  };

  const openGames = (leagueId: string, sessionId: string) => {
    router.push({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
      params: { leagueId, sessionId } as never,
    } as never);
  };

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
        <Card style={styles.tonightCard}>
          <Text style={styles.sectionTitle}>Tonight</Text>
          <Text style={styles.meta}>
            {activeLeague
              ? `${activeLeague.name} - ${activeLeague.houseName ?? 'No house set'}`
              : 'Create your first league to start tracking sessions and games.'}
          </Text>
          <View style={styles.primaryActionsRow}>
            <View style={styles.actionSlot}>
              <Button
                disabled={!activeLeagueId || isLeaguesLoading}
                label="Continue tonight"
                onPress={() => {
                  if (!activeLeagueId) {
                    return;
                  }

                  openSessions(activeLeagueId, true);
                }}
                variant="secondary"
              />
            </View>
            <View style={styles.actionSlot}>
              <Button
                disabled={!activeLeagueId || isLeaguesLoading}
                label="Manage sessions"
                onPress={() => {
                  if (!activeLeagueId) {
                    return;
                  }

                  openSessions(activeLeagueId, false);
                }}
                variant="secondary"
              />
            </View>
          </View>
        </Card>

        <Card muted style={styles.contextCard}>
          <Text style={styles.sectionTitle}>Current session</Text>
          {isSessionsLoading ? (
            <Text style={styles.meta}>Loading session context...</Text>
          ) : activeLeague ? (
            <>
              <Text style={styles.meta}>
                {activeSession
                  ? `${todaySessionId ? 'Tonight' : 'Most recent'}: ${formatIsoDateLabel(activeSession.date)}`
                  : 'No sessions yet for this league.'}
              </Text>
              <Text style={styles.meta}>
                {isGamesLoading
                  ? 'Loading game progress...'
                  : activeSession
                    ? activeLeague.gamesPerSession
                      ? `Games: ${String(games.length)} / ${String(activeLeague.gamesPerSession)}`
                      : `Games: ${String(games.length)}`
                    : "Continue tonight will create today's session automatically."}
              </Text>
              <View style={styles.secondaryActionsRow}>
                <Pressable
                  disabled={!activeSessionId}
                  onPress={() => {
                    if (!activeLeagueId || !activeSessionId) {
                      return;
                    }

                    openGames(activeLeagueId, activeSessionId);
                  }}
                  style={({ pressed }) => [
                    styles.inlineAction,
                    !activeSessionId ? styles.inlineActionDisabled : null,
                    pressed ? styles.inlineActionPressed : null,
                  ]}
                >
                  <Text style={styles.inlineActionLabel}>Open games</Text>
                </Pressable>
                <Pressable
                  disabled={!activeLeagueId}
                  onPress={() => {
                    if (!activeLeagueId) {
                      return;
                    }

                    openSessions(activeLeagueId, true);
                  }}
                  style={({ pressed }) => [
                    styles.inlineAction,
                    !activeLeagueId ? styles.inlineActionDisabled : null,
                    pressed ? styles.inlineActionPressed : null,
                  ]}
                >
                  <Text style={styles.inlineActionLabel}>Add game</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.meta}>
              No leagues yet. Open Journal to create one.
            </Text>
          )}
        </Card>

        <Card muted>
          <Text style={styles.sectionTitle}>Recent leagues</Text>
          {leagues.slice(0, 3).map((league) => (
            <Pressable
              key={league._id}
              onPress={() => openSessions(league._id, false)}
              style={({ pressed }) => [
                styles.leagueShortcut,
                pressed ? styles.leagueShortcutPressed : null,
              ]}
            >
              <Text style={styles.leagueShortcutTitle}>{league.name}</Text>
              <Text style={styles.meta}>
                {league.houseName ?? 'No house set'}
              </Text>
            </Pressable>
          ))}
          {leagues.length === 0 ? (
            <Pressable
              onPress={() => {
                router.push('/journal' as never);
              }}
              style={({ pressed }) => [
                styles.inlineAction,
                pressed ? styles.inlineActionPressed : null,
              ]}
            >
              <Text style={styles.inlineActionLabel}>Open Journal</Text>
            </Pressable>
          ) : null}
        </Card>
      </ScrollView>
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
    tonightCard: {
      gap: spacing.sm,
    },
    contextCard: {
      gap: spacing.sm,
    },
    sectionTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    meta: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
    primaryActionsRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    actionSlot: {
      flex: 1,
    },
    secondaryActionsRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    inlineAction: {
      paddingVertical: spacing.xs,
    },
    inlineActionDisabled: {
      opacity: 0.6,
    },
    inlineActionPressed: {
      opacity: 0.82,
    },
    inlineActionLabel: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.accent,
    },
    leagueShortcut: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.xs,
      backgroundColor: colors.surface,
    },
    leagueShortcutPressed: {
      backgroundColor: colors.accentMuted,
    },
    leagueShortcutTitle: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
  });
