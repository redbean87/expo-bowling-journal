import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RollingSeriesPoint } from '@/utils/analytics-stats';

import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';

const BAR_HEIGHT = 24;
const MAX_VISIBLE_POINTS = 5;

const createRollingSeriesStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    chartContainer: {
      gap: spacing.xs,
    },
    seriesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    rowLabel: {
      width: 40,
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      textAlign: 'right',
    },
    barContainer: {
      flex: 1,
      height: BAR_HEIGHT,
      backgroundColor: colors.border,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    bar: {
      height: '100%',
      borderRadius: radius.sm,
    },
    barLabel: {
      marginLeft: spacing.xs,
      fontSize: typeScale.body,
      fontWeight: '700',
      color: colors.textPrimary,
      width: 50,
    },
    emptyText: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });

interface RollingSeriesChartProps {
  rollingSeries: RollingSeriesPoint[];
  seasonAvg: number | null;
  colors: ThemeColors;
  windowSize: number;
}

export function RollingSeriesChart({
  rollingSeries,
  seasonAvg,
  colors,
  windowSize,
}: RollingSeriesChartProps) {
  const s = useMemo(() => createRollingSeriesStyles(colors), [colors]);

  if (rollingSeries.length === 0) {
    return (
      <Text style={s.emptyText}>
        Need at least {windowSize} games for rolling series average.
      </Text>
    );
  }

  // Take last 5 and reverse so newest is first (top)
  const recentSeries = rollingSeries.slice(-MAX_VISIBLE_POINTS).reverse();

  const minAvg = Math.min(...recentSeries.map((r) => r.seriesAverage));
  const maxAvg = Math.max(...recentSeries.map((r) => r.seriesAverage));
  const range = maxAvg - minAvg || 1;

  const getBarColor = (avgScore: number): string => {
    if (seasonAvg) {
      if (avgScore >= seasonAvg + 10) return colors.success;
      if (avgScore >= seasonAvg) return colors.accent;
      if (avgScore >= seasonAvg - 10) return colors.warning;
      return colors.danger;
    }
    return colors.accent;
  };

  return (
    <View style={s.container}>
      <View style={s.chartContainer}>
        {recentSeries.map((point) => {
          const barWidth = ((point.seriesAverage - minAvg) / range) * 80 + 20;
          const barColor = getBarColor(point.seriesAverage);
          const label = `#${point.gameIndex + 1}`;

          return (
            <View key={point.gameIndex} style={s.seriesRow}>
              <Text style={s.rowLabel}>{label}</Text>
              <View style={s.barContainer}>
                <View
                  style={[
                    s.bar,
                    { width: `${barWidth}%`, backgroundColor: barColor },
                  ]}
                />
              </View>
              <Text style={s.barLabel}>{point.seriesAverage.toFixed(0)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
