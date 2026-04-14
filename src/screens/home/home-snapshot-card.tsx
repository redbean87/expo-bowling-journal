import { MaterialIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { HomeAnalytics } from './home-analytics-hook';

import { Card } from '@/components/ui';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type HomeSnapshotCardProps = {
  analytics: HomeAnalytics;
  isLoading: boolean;
};

export function HomeSnapshotCard({
  analytics,
  isLoading,
}: HomeSnapshotCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { seasonAvg, strikeRate, spareRate } = analytics;

  if (isLoading) {
    return (
      <Card muted style={styles.card}>
        <Text style={styles.title}>At a glance</Text>
        <Text style={styles.loadingText}>Loading stats...</Text>
      </Card>
    );
  }

  const hasData = seasonAvg !== null && analytics.totalGames > 0;

  if (!hasData) {
    return (
      <Card muted style={styles.card}>
        <Text style={styles.title}>At a glance</Text>
        <Text style={styles.emptyText}>No games yet this season</Text>
      </Card>
    );
  }

  const avgDisplay = seasonAvg?.toFixed(1) ?? '-';
  const strikeDisplay =
    strikeRate !== null ? `${Math.round(strikeRate * 100)}%` : '-';
  const spareDisplay =
    spareRate !== null ? `${Math.round(spareRate * 100)}%` : '-';

  // Determine trend indicator for avg
  const avgTrend = analytics.avgTrend;
  const trendIcon =
    avgTrend !== null
      ? avgTrend > 0
        ? { name: 'trending-up' as const, color: colors.success }
        : avgTrend < 0
          ? { name: 'trending-down' as const, color: colors.warning }
          : null
      : null;

  return (
    <Card muted style={styles.card}>
      <Text style={styles.title}>At a glance</Text>
      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Average</Text>
          <View style={styles.valueRow}>
            <Text style={styles.statValue}>{avgDisplay}</Text>
            {trendIcon && (
              <MaterialIcons
                name={trendIcon.name}
                size={20}
                color={trendIcon.color}
                style={styles.trendIcon}
              />
            )}
          </View>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Strike</Text>
          <Text style={styles.statValue}>{strikeDisplay}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Spare</Text>
          <Text style={styles.statValue}>{spareDisplay}</Text>
        </View>
      </View>
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: spacing.xs,
    },
    title: {
      fontSize: typeScale.body,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.md,
      paddingTop: spacing.xs,
    },
    stat: {
      alignItems: 'flex-start',
      flex: 1,
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    statLabel: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    statValue: {
      fontSize: typeScale.title,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    trendIcon: {
      marginLeft: 2,
    },
    loadingText: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    emptyText: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
  });
