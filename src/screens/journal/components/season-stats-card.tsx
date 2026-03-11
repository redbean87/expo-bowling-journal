import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { buildSessionNightSummary } from '../../journal-games-night-summary';

import { Card } from '@/components/ui';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type SeasonStatsCardProps = {
  isLoading: boolean;
  seasonSummary: ReturnType<typeof buildSessionNightSummary>;
  sessionCount: number;
};

export function SeasonStatsCard({
  isLoading,
  seasonSummary,
  sessionCount,
}: SeasonStatsCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Card muted style={styles.summaryCard}>
      <View style={styles.summaryHeaderRow}>
        <Text style={styles.summaryTitle}>Season stats</Text>
        <Text style={[styles.meta, styles.summaryValueText]}>
          Sessions: {String(sessionCount)}
        </Text>
      </View>
      {isLoading && <Text style={styles.meta}>Loading...</Text>}
      {!isLoading && seasonSummary.gamesPlayed > 0 && (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.meta}>
              Games: {String(seasonSummary.gamesPlayed)}
            </Text>
            <Text style={[styles.meta, styles.summaryValueText]}>
              Series: {seasonSummary.totalPins}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.meta}>
              Average: {seasonSummary.average.toFixed(2)}
            </Text>
            <Text style={[styles.meta, styles.summaryValueText]}>
              High series: {seasonSummary.highSeries ?? '-'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.meta}>
              High game: {seasonSummary.highGame ?? '-'}
            </Text>
            <Text style={[styles.meta, styles.summaryValueText]}>
              Low game: {seasonSummary.lowGame ?? '-'}
            </Text>
          </View>
          <Text style={styles.meta}>
            Strikes {seasonSummary.strikes} | Spares {seasonSummary.spares} |
            Opens {seasonSummary.opens}
          </Text>
        </>
      )}
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    summaryCard: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: 10,
      gap: spacing.xs,
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.borderStrong,
    },
    summaryHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      alignItems: 'center',
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    summaryValueText: {
      textAlign: 'right',
      opacity: 0.9,
    },
  });
