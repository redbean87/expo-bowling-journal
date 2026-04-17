import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { LeaguePickerSheet } from './home/league-picker-sheet';

import type { LeagueId, SessionId } from '@/services/journal';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card } from '@/components/ui';
import { useLeagueAnalytics } from '@/hooks/journal';
import { useHomeLeague } from '@/hooks/journal/use-home-league';
import {
  HomeFocusCard,
  HomeQuickActions,
  HomeSnapshotCard,
  useHomeAnalytics,
} from '@/screens/home';
import { HomeTonightCard } from '@/screens/home/home-tonight-card';
import { buildJournalGamesRouteParams } from '@/screens/journal/journal-route-params';
import {
  formatIsoDateForToday,
  formatIsoDateLabel,
} from '@/screens/journal-fast-lane-utils';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { computePersonalRecords } from '@/utils/analytics-stats';

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
    leagueList: {
      width: '100%',
      gap: spacing.xs,
    },
  });

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    leagues,
    activeLeague,
    isLoading: isHomeLeagueLoading,
    setHomeLeague,
    hasLeagues,
  } = useHomeLeague();
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  // Get analytics for the active league (use the first league if no active league selected yet)
  const selectedLeagueId = activeLeague?._id ?? null;
  const { sessionAggregates, isLoading: isAnalyticsLoading } =
    useLeagueAnalytics(selectedLeagueId as LeagueId | null);
  const records = useMemo(
    () =>
      sessionAggregates.length > 0
        ? computePersonalRecords(sessionAggregates)
        : null,
    [sessionAggregates]
  );
  const analytics = useHomeAnalytics(sessionAggregates, records);

  const isLoading = isHomeLeagueLoading || isAnalyticsLoading;

  // Check for today's session and most recent session
  const today = formatIsoDateForToday();
  const todaySession = sessionAggregates.find((s) => s.date === today);
  const mostRecentSession = sessionAggregates[0] ?? null;
  const showRecentButton = !todaySession && mostRecentSession && activeLeague;

  // Empty state: no leagues or no recent leagues
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
            <View style={{ width: '100%', gap: spacing.sm }}>
              <Button
                label={hasLeagues ? 'Go to Journal' : 'Open Journal'}
                onPress={() => router.push('/journal' as never)}
                variant="secondary"
              />
              <Button
                label="View Journal"
                onPress={() => router.push('/journal' as never)}
                variant="secondary"
              />
              <Button
                label="Import Data"
                onPress={() => router.push('/profile' as never)}
                variant="secondary"
              />
            </View>
          </Card>
        </ScrollView>
      </ScreenLayout>
    );
  }

  // Determine context for quick actions
  const quickActionsContext = todaySession ? 'league-day' : 'off-night';

  const handleViewRecent = () => {
    if (!activeLeague?._id || !mostRecentSession) return;
    const recentSessionId = mostRecentSession.sessionId as SessionId;
    router.push({
      pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
      params: buildJournalGamesRouteParams({
        leagueId: activeLeague._id as LeagueId,
        sessionId: recentSessionId,
      }) as never,
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
        {activeLeague && (
          <>
            <HomeTonightCard
              league={activeLeague}
              isLoading={isLoading}
              onLeaguePickerPress={() => setIsPickerVisible(true)}
            />
            {showRecentButton && (
              <Button
                disabled={isLoading}
                label={`View ${formatIsoDateLabel(mostRecentSession.date)}`}
                onPress={handleViewRecent}
                variant="outline"
              />
            )}
            <HomeSnapshotCard
              analytics={analytics}
              isLoading={isAnalyticsLoading}
            />
            <HomeFocusCard
              insight={analytics.insight}
              isLoading={isAnalyticsLoading}
            />
            <HomeQuickActions
              context={quickActionsContext}
              disabled={isLoading}
            />
          </>
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
