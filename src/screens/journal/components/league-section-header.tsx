import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type LeagueSectionHeaderProps = {
  title: string;
};

export function LeagueSectionHeader({ title }: LeagueSectionHeaderProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{title.toUpperCase()}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    label: {
      fontSize: typeScale.bodySm,
      fontWeight: '600',
      letterSpacing: 0.6,
      color: colors.textSecondary,
    },
  });
