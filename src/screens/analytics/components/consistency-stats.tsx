import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type {
  ConsistencyMetrics,
  SessionConsistency,
} from '@/utils/analytics-stats';

import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';

const createConsistencyStatsStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    overallCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    overallTitle: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      fontWeight: '600',
      marginBottom: spacing.xs,
    },
    overallValue: {
      fontSize: typeScale.title,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    overallUnit: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
      fontWeight: '400',
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    statCell: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      padding: spacing.sm,
    },
    statLabel: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    statValue: {
      fontSize: typeScale.body,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    statSubtext: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });

interface ConsistencyStatsCardProps {
  metrics: ConsistencyMetrics;
  colors: ThemeColors;
}

export function ConsistencyStatsCard({
  metrics,
  colors,
}: ConsistencyStatsCardProps) {
  const s = useMemo(() => createConsistencyStatsStyles(colors), [colors]);

  const getRating = (cv: number): { label: string; color: string } => {
    if (cv < 5) return { label: 'Excellent', color: colors.success };
    if (cv < 8) return { label: 'Good', color: colors.accent };
    if (cv < 12) return { label: 'Average', color: colors.warning };
    return { label: 'Inconsistent', color: colors.danger };
  };

  const rating = getRating(metrics.coefficientOfVariation);

  return (
    <View style={s.container}>
      <View style={s.overallCard}>
        <Text style={s.overallTitle}>Consistency Rating</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: spacing.sm,
          }}
        >
          <Text style={[s.overallValue, { color: rating.color }]}>
            {rating.label}
          </Text>
          <Text style={s.overallUnit}>
            (CV: {metrics.coefficientOfVariation.toFixed(1)}%)
          </Text>
        </View>
      </View>

      <View style={s.statsGrid}>
        <View style={s.statCell}>
          <Text style={s.statLabel}>Std Deviation</Text>
          <Text style={s.statValue}>{metrics.stdDev.toFixed(1)}</Text>
          <Text style={s.statSubtext}>pins from average</Text>
        </View>

        <View style={s.statCell}>
          <Text style={s.statLabel}>Variance</Text>
          <Text style={s.statValue}>{metrics.variance.toFixed(0)}</Text>
        </View>

        <View style={s.statCell}>
          <Text style={s.statLabel}>Score Range</Text>
          <Text style={s.statValue}>{metrics.range}</Text>
          <Text style={s.statSubtext}>
            {metrics.minGame}-{metrics.maxGame}
          </Text>
        </View>

        <View style={s.statCell}>
          <Text style={s.statLabel}>Average</Text>
          <Text style={s.statValue}>{metrics.avgGameScore.toFixed(1)}</Text>
        </View>
      </View>
    </View>
  );
}

const createSessionConsistencyListStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.xs,
    },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    sessionInfo: {
      flex: 1,
    },
    sessionLabel: {
      fontSize: typeScale.body,
      color: colors.textPrimary,
    },
    sessionGames: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    cvBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
    },
    cvText: {
      fontSize: typeScale.body,
      fontWeight: '700',
    },
    emptyText: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });

interface SessionConsistencyListProps {
  sessions: SessionConsistency[];
  colors: ThemeColors;
}

export function SessionConsistencyList({
  sessions,
  colors,
}: SessionConsistencyListProps) {
  const s = useMemo(() => createSessionConsistencyListStyles(colors), [colors]);

  const getCvColor = (cv: number): string => {
    if (cv < 5) return colors.success;
    if (cv < 8) return colors.accent;
    if (cv < 12) return colors.warning;
    return colors.danger;
  };

  if (sessions.length === 0) {
    return (
      <Text style={s.emptyText}>
        Need 2+ games per session for consistency data
      </Text>
    );
  }

  return (
    <View style={s.container}>
      {sessions
        .slice(-5)
        .reverse()
        .map((session) => {
          const date = new Date(session.date);
          const label = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          return (
            <View key={session.sessionId} style={s.sessionRow}>
              <View style={s.sessionInfo}>
                <Text style={s.sessionLabel}>{label}</Text>
                <Text style={s.sessionGames}>{session.gameCount} games</Text>
              </View>
              <View
                style={[s.cvBadge, { backgroundColor: colors.accentMuted }]}
              >
                <Text
                  style={[
                    s.cvText,
                    { color: getCvColor(session.coefficientOfVariation) },
                  ]}
                >
                  CV {session.coefficientOfVariation.toFixed(1)}%
                </Text>
              </View>
            </View>
          );
        })}
    </View>
  );
}
