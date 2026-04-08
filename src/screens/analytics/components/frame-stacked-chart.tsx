import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SessionAggregate } from '@/utils/analytics-stats';

import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';

function sessionLabel(s: SessionAggregate, index: number): string {
  if (s.weekNumber !== null) return `W${s.weekNumber}`;
  return `#${index + 1}`;
}

const CHART_HEIGHT = 120;
const BAR_WIDTH = 30;
const BAR_GAP = 6;

const createFrameChartStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    padding: { paddingHorizontal: spacing.xs },
    bars: {
      height: CHART_HEIGHT,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: BAR_GAP,
    },
    emptyBar: {
      width: BAR_WIDTH,
      height: CHART_HEIGHT,
      borderRadius: radius.sm,
      backgroundColor: colors.border,
    },
    bar: {
      width: BAR_WIDTH,
      height: CHART_HEIGHT,
      borderRadius: radius.sm,
      overflow: 'hidden',
      flexDirection: 'column-reverse',
    },
    segmentStrike: { backgroundColor: colors.accent },
    segmentSpare: { backgroundColor: colors.success },
    segmentOpen: { backgroundColor: colors.warning },
    labelRow: {
      flexDirection: 'row',
      gap: BAR_GAP,
      marginTop: spacing.xs,
    },
    labelText: {
      width: BAR_WIDTH,
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });

export function FrameStackedChart({
  sessions,
  colors,
}: {
  sessions: SessionAggregate[];
  colors: ThemeColors;
}) {
  const s = useMemo(() => createFrameChartStyles(colors), [colors]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={s.padding}>
        <View style={s.bars}>
          {sessions.map((session) => {
            const total =
              session.totalStrikes + session.totalSpares + session.totalOpens;
            if (total === 0) {
              return <View key={session.sessionId} style={s.emptyBar} />;
            }
            const strikeH = Math.max(
              2,
              (session.totalStrikes / total) * CHART_HEIGHT
            );
            const spareH = Math.max(
              2,
              (session.totalSpares / total) * CHART_HEIGHT
            );
            const openH = Math.max(
              2,
              (session.totalOpens / total) * CHART_HEIGHT
            );
            return (
              <View key={session.sessionId} style={s.bar}>
                <View style={[s.segmentStrike, { height: strikeH }]} />
                <View style={[s.segmentSpare, { height: spareH }]} />
                <View style={[s.segmentOpen, { height: openH }]} />
              </View>
            );
          })}
        </View>
        <View style={s.labelRow}>
          {sessions.map((session, i) => (
            <Text key={session.sessionId} style={s.labelText}>
              {sessionLabel(session, i)}
            </Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
