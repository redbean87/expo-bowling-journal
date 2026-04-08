import { MaterialIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';

const createRecordCellStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    cell: {
      flex: 1,
      minWidth: '30%',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    value: {
      fontSize: typeScale.title,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    label: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });

export function RecordCell({
  label,
  value,
  trend,
  colors,
}: {
  label: string;
  value: string | number;
  trend?: number | null;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createRecordCellStyles(colors), [colors]);

  const trendIcon =
    trend == null
      ? null
      : trend > 0
        ? ({ name: 'trending-up', color: colors.success } as const)
        : trend < 0
          ? ({ name: 'trending-down', color: colors.danger } as const)
          : null;

  return (
    <View style={s.cell}>
      <View style={s.valueRow}>
        <Text style={s.value}>{String(value)}</Text>
        {trendIcon ? (
          <MaterialIcons
            name={trendIcon.name}
            size={16}
            color={trendIcon.color}
          />
        ) : null}
      </View>
      <Text style={s.label}>{label}</Text>
    </View>
  );
}
