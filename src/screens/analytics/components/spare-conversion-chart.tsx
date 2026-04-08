import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SpareConversionData } from '@/hooks/journal/use-league-analytics';

import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';

const CHART_HEIGHT = 120;
const BAR_WIDTH = 28;
const BAR_GAP = 4;

const createSpareConversionStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    overallSection: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    overallCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      alignItems: 'center',
    },
    overallValue: {
      fontSize: typeScale.title,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    overallLabel: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    sectionTitle: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    chartScroll: {
      marginHorizontal: -spacing.md,
      paddingHorizontal: spacing.md,
    },
    barsContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: BAR_GAP,
      height: CHART_HEIGHT,
    },
    barWrapper: {
      alignItems: 'center',
      width: BAR_WIDTH,
    },
    bar: {
      width: BAR_WIDTH,
      borderTopLeftRadius: radius.sm,
      borderTopRightRadius: radius.sm,
    },
    barLabel: {
      fontSize: 9,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    barValue: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    emptyText: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
    pinMaskList: {
      gap: spacing.xs,
    },
    pinMaskRow: {
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
    pinMaskInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    pinVisualization: {
      flexDirection: 'row',
      gap: 2,
    },
    pin: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    pinMaskLabel: {
      fontSize: typeScale.body,
      color: colors.textPrimary,
    },
    conversionBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm,
    },
    conversionText: {
      fontSize: typeScale.body,
      fontWeight: '700',
    },
  });

interface SpareConversionChartProps {
  data: SpareConversionData | null;
  colors: ThemeColors;
}

function getPinPositions(mask: number): boolean[] {
  const positions: boolean[] = [];
  for (let i = 0; i < 10; i++) {
    positions.push((mask & (1 << i)) !== 0);
  }
  return positions;
}

function renderPinDeck(mask: number, colors: ThemeColors) {
  const pins = getPinPositions(mask);
  // pins array: pins[0]=pin1, pins[1]=pin2, ..., pins[9]=pin10

  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      {/* Back row: pins 7, 8, 9, 10 */}
      <View style={{ flexDirection: 'row', gap: 2 }}>
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[6] ? colors.textPrimary : colors.border },
          ]}
        />
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[7] ? colors.textPrimary : colors.border },
          ]}
        />
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[8] ? colors.textPrimary : colors.border },
          ]}
        />
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[9] ? colors.textPrimary : colors.border },
          ]}
        />
      </View>
      {/* Middle row: pins 4, 5, 6 */}
      <View style={{ flexDirection: 'row', gap: 2 }}>
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[3] ? colors.textPrimary : colors.border },
          ]}
        />
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[4] ? colors.textPrimary : colors.border },
          ]}
        />
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[5] ? colors.textPrimary : colors.border },
          ]}
        />
      </View>
      {/* Front row: pins 2, 3 */}
      <View style={{ flexDirection: 'row', gap: 2 }}>
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[1] ? colors.textPrimary : colors.border },
          ]}
        />
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[2] ? colors.textPrimary : colors.border },
          ]}
        />
      </View>
      {/* Head pin: pin 1 */}
      <View style={{ flexDirection: 'row', gap: 2 }}>
        <View
          style={[
            styles.pin,
            { backgroundColor: pins[0] ? colors.textPrimary : colors.border },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

function getConversionColor(rate: number, colors: ThemeColors): string {
  if (rate >= 0.7) return colors.success;
  if (rate >= 0.5) return colors.accent;
  if (rate >= 0.3) return colors.warning;
  return colors.danger;
}

export function SpareConversionChart({
  data,
  colors,
}: SpareConversionChartProps) {
  const s = useMemo(() => createSpareConversionStyles(colors), [colors]);

  if (!data || data.totalSpareAttempts === 0) {
    return (
      <Text style={s.emptyText}>
        No spare conversion data available. Play more games to see your spare
        stats.
      </Text>
    );
  }

  const overallRate = data.totalSparesConverted / data.totalSpareAttempts;

  const maxRate =
    data.byPinCount.length > 0
      ? Math.max(...data.byPinCount.map((p) => p.conversionRate))
      : 0;

  return (
    <View style={s.container}>
      <View style={s.overallSection}>
        <View style={s.overallCard}>
          <Text style={s.overallValue}>{(overallRate * 100).toFixed(0)}%</Text>
          <Text style={s.overallLabel}>Overall Conversion</Text>
        </View>
        <View style={s.overallCard}>
          <Text style={s.overallValue}>{data.totalSpareAttempts}</Text>
          <Text style={s.overallLabel}>Spare Attempts</Text>
        </View>
      </View>

      {data.byPinCount.filter((p) => p.conversionRate > 0).length > 0 && (
        <>
          <Text style={s.sectionTitle}>By Pin Count</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.barsContainer}>
              {data.byPinCount
                .filter((pinData) => pinData.conversionRate > 0)
                .map((pinData) => {
                  const barHeight =
                    maxRate > 0
                      ? Math.max(
                          20,
                          (pinData.conversionRate / maxRate) * CHART_HEIGHT
                        )
                      : 20;
                  const barColor = getConversionColor(
                    pinData.conversionRate,
                    colors
                  );

                  return (
                    <View key={pinData.pinCount} style={s.barWrapper}>
                      <Text style={s.barValue}>
                        {(pinData.conversionRate * 100).toFixed(0)}%
                      </Text>
                      <View
                        style={[
                          s.bar,
                          { height: barHeight, backgroundColor: barColor },
                        ]}
                      />
                      <Text style={s.barLabel}>{pinData.pinCount} pin</Text>
                    </View>
                  );
                })}
            </View>
          </ScrollView>
        </>
      )}

      {data.byPinMask.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Common Pin Leaves</Text>
          <View style={s.pinMaskList}>
            {data.byPinMask.slice(0, 5).map((maskData) => {
              const color = getConversionColor(maskData.conversionRate, colors);
              const percentage = (maskData.conversionRate * 100).toFixed(0);

              return (
                <View key={maskData.pinMask} style={s.pinMaskRow}>
                  <View style={s.pinMaskInfo}>
                    {renderPinDeck(maskData.pinMask, colors)}
                    <View>
                      <Text style={s.pinMaskLabel}>
                        {maskData.attempts} attempts
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      s.conversionBadge,
                      { backgroundColor: colors.accentMuted },
                    ]}
                  >
                    <Text style={[s.conversionText, { color }]}>
                      {percentage}%
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
