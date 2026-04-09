import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  ConsistencyStatsCard,
  SessionConsistencyList,
} from './consistency-stats';
import { FrameStackedChart } from './frame-stacked-chart';
import { GamePositionCard } from './game-position-card';
import { LegendDot } from './legend-dot';
import { RecordCell } from './record-cell';
import { RollingSeriesChart } from './rolling-series-chart';
import { SessionLineChart } from './session-line-chart';
import { SpareConversionChart } from './spare-conversion-chart';

import type { SpareConversionData } from '@/hooks/journal/use-league-analytics';

import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import {
  computeConsistencyMetrics,
  computeCumulativeAverage,
  computeGamePositionAvgs,
  computePersonalRecords,
  computeRollingSeriesAverage,
  computeSessionConsistency,
  type SessionAggregate,
} from '@/utils/analytics-stats';

const createAnalyticsContentStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: {
      paddingVertical: spacing.xxl,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
    },
    card: {
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      backgroundColor: colors.surface,
    },
    cardTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    recordsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    recordSpacer: { flex: 1, minWidth: '30%' },
    legend: {
      flexDirection: 'row',
      gap: spacing.md,
    },
  });

interface AnalyticsContentProps {
  isLoading: boolean;
  leagues: { _id: string }[];
  sessionsWithGames: SessionAggregate[];
  records: ReturnType<typeof computePersonalRecords>;
  gamePositionAvgs: ReturnType<typeof computeGamePositionAvgs>;
  spareConversion: SpareConversionData | null;
  isSpareConversionLoading: boolean;
  gamesPerSession: number | null;
  colors: ThemeColors;
}

export function AnalyticsContent({
  isLoading,
  leagues,
  sessionsWithGames,
  records,
  gamePositionAvgs,
  spareConversion,
  isSpareConversionLoading,
  gamesPerSession,
  colors,
}: AnalyticsContentProps) {
  const styles = createAnalyticsContentStyles(colors);

  const allGameScores = sessionsWithGames.flatMap((s) => s.gameScores);
  const rollingWindowSize = gamesPerSession ?? 3;
  const rollingSeries = computeRollingSeriesAverage(
    sessionsWithGames,
    rollingWindowSize
  );
  const sessionConsistency = computeSessionConsistency(sessionsWithGames);
  const consistencyMetrics = computeConsistencyMetrics(allGameScores);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (leagues.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No leagues found.</Text>
      </View>
    );
  }

  if (sessionsWithGames.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No games recorded yet.</Text>
      </View>
    );
  }

  return (
    <>
      {/* Personal Records */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personal Records</Text>
        <View style={styles.recordsGrid}>
          <RecordCell
            label="High Game"
            value={records.highGame ?? '-'}
            colors={colors}
          />
          <RecordCell
            label="High 3-Game Series"
            value={records.highSeries ?? '-'}
            colors={colors}
          />
          <RecordCell
            label="Season Avg"
            value={
              records.seasonAvg !== null ? records.seasonAvg.toFixed(1) : '-'
            }
            trend={records.avgTrend}
            colors={colors}
          />
          <RecordCell
            label="Games"
            value={records.totalGames}
            colors={colors}
          />
          <RecordCell
            label="Strike Rate"
            value={
              records.strikeRate !== null
                ? `${(records.strikeRate * 100).toFixed(0)}%`
                : '-'
            }
            colors={colors}
          />
          <RecordCell
            label="Spare Rate"
            value={
              records.spareRate !== null
                ? `${(records.spareRate * 100).toFixed(0)}%`
                : '-'
            }
            colors={colors}
          />
          <RecordCell
            label="Clean Games"
            value={records.cleanGames}
            colors={colors}
          />
          <View style={styles.recordSpacer} />
          <View style={styles.recordSpacer} />
        </View>
      </View>

      {/* Rolling Series Average — immediate momentum check */}
      {rollingSeries.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Rolling Average (Last {rollingWindowSize} Games)
          </Text>
          <RollingSeriesChart
            rollingSeries={rollingSeries}
            seasonAvg={records.seasonAvg}
            colors={colors}
            windowSize={rollingWindowSize}
          />
        </View>
      )}

      {/* Game position averages — by game 1, 2, 3 */}
      {gamePositionAvgs.length >= 2 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Game Averages</Text>
          <GamePositionCard positions={gamePositionAvgs} colors={colors} />
        </View>
      )}

      {/* Session trends over time */}
      {sessionsWithGames.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Average per Session</Text>
          <SessionLineChart
            sessions={sessionsWithGames}
            values={sessionsWithGames.map((s) =>
              s.gameCount > 0 ? s.totalPins / s.gameCount : 0
            )}
            trendValues={computeCumulativeAverage(
              sessionsWithGames.map((s) =>
                s.gameCount > 0 ? s.totalPins / s.gameCount : null
              )
            )}
            color={colors.accent}
            colors={colors}
          />
        </View>
      )}

      {sessionsWithGames.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>High Game per Session</Text>
          <SessionLineChart
            sessions={sessionsWithGames}
            values={sessionsWithGames.map((s) => s.highGame ?? 0)}
            trendValues={computeCumulativeAverage(
              sessionsWithGames.map((s) => s.highGame)
            )}
            color={colors.success}
            colors={colors}
          />
        </View>
      )}

      {/* Consistency Analysis — characterizes the patterns above */}
      {allGameScores.length >= 2 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Consistency Analysis</Text>
          <ConsistencyStatsCard metrics={consistencyMetrics} colors={colors} />
          {sessionConsistency.length > 0 && (
            <>
              <Text
                style={{
                  fontSize: typeScale.bodySm,
                  color: colors.textSecondary,
                  marginTop: spacing.md,
                }}
              >
                Recent Session Consistency (lower CV = more consistent)
              </Text>
              <SessionConsistencyList
                sessions={sessionConsistency}
                colors={colors}
              />
            </>
          )}
        </View>
      )}

      {/* Spare Conversion — technical deep dive */}
      {!isSpareConversionLoading && spareConversion && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Spare Conversion by Pin Leave</Text>
          <SpareConversionChart data={spareConversion} colors={colors} />
        </View>
      )}

      {/* Frame Results per Session — raw breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Frame Results per Session</Text>
        <View style={styles.legend}>
          <LegendDot color={colors.accent} label="Strike" colors={colors} />
          <LegendDot color={colors.success} label="Spare" colors={colors} />
          <LegendDot color={colors.warning} label="Open" colors={colors} />
        </View>
        <FrameStackedChart sessions={sessionsWithGames} colors={colors} />
      </View>
    </>
  );
}
