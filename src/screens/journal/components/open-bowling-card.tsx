import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressableCard } from '@/components/ui';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type OpenBowlingCardProps = {
  mostRecentSessionDate: string | null;
  onPress: () => void;
};

export function OpenBowlingCard({
  mostRecentSessionDate,
  onPress,
}: OpenBowlingCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const subtitle = mostRecentSessionDate
    ? `Last session: ${formatDate(mostRecentSessionDate)}`
    : 'Tap to start a session';

  return (
    <PressableCard style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <MaterialIcons
          name="sports-score"
          size={22}
          color={colors.accent}
          style={styles.icon}
        />
        <View style={styles.textBlock}>
          <Text style={styles.title}>Open Bowling</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={colors.textSecondary}
        />
      </View>
    </PressableCard>
  );
}

function formatDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(isoDate + 'T00:00:00'));
  } catch {
    return isoDate;
  }
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    icon: {
      width: 28,
      textAlign: 'center',
    },
    textBlock: {
      flex: 1,
      gap: spacing.xs,
    },
    title: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
  });
