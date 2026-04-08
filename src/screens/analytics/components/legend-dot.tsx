import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';

const createLegendDotStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    dot: { width: 10, height: 10, borderRadius: 5 },
    label: { fontSize: typeScale.bodySm, color: colors.textSecondary },
  });

export function LegendDot({
  color,
  label,
  colors,
}: {
  color: string;
  label: string;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createLegendDotStyles(colors), [colors]);

  return (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.label}>{label}</Text>
    </View>
  );
}
