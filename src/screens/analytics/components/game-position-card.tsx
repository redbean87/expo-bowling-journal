import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';

const GAME_BAR_HEIGHT = 60;

const createGamePositionStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-around' },
    col: { alignItems: 'center', gap: spacing.xs },
    avgText: { fontSize: typeScale.bodySm, fontWeight: '700' },
    avgTextBest: { color: colors.accent },
    avgTextDefault: { color: colors.textPrimary },
    barContainer: {
      height: GAME_BAR_HEIGHT,
      justifyContent: 'flex-end',
      width: 36,
    },
    bar: { backgroundColor: colors.accent, borderRadius: radius.sm },
    posLabel: { fontSize: typeScale.bodySm, color: colors.textSecondary },
  });

export function GamePositionCard({
  positions,
  colors,
}: {
  positions: { position: number; avg: number; count: number }[];
  colors: ThemeColors;
}) {
  const s = useMemo(() => createGamePositionStyles(colors), [colors]);

  const avgs = positions.map((p) => p.avg);
  const minAvg = Math.min(...avgs);
  const maxAvg = Math.max(...avgs);
  const range = maxAvg - minAvg || 1;
  const bestIdx = avgs.indexOf(maxAvg);

  return (
    <View style={s.row}>
      {positions.map((p, i) => {
        const barH = Math.max(
          8,
          ((p.avg - minAvg) / range) * (GAME_BAR_HEIGHT - 8) + 8
        );
        const isBest = i === bestIdx;
        return (
          <View key={p.position} style={s.col}>
            <Text
              style={[s.avgText, isBest ? s.avgTextBest : s.avgTextDefault]}
            >
              {p.avg.toFixed(1)}
            </Text>
            <View style={s.barContainer}>
              <View
                style={[s.bar, { height: barH, opacity: isBest ? 1 : 0.35 }]}
              />
            </View>
            <Text style={s.posLabel}>Game {p.position + 1}</Text>
          </View>
        );
      })}
    </View>
  );
}
