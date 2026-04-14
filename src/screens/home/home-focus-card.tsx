import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { HomeInsight } from './home-analytics-hook';

import { Card } from '@/components/ui';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type HomeFocusCardProps = {
  insight: HomeInsight;
  isLoading: boolean;
};

export function HomeFocusCard({ insight, isLoading }: HomeFocusCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isLoading) {
    return (
      <Card muted style={styles.card}>
        <Text style={styles.title}>Focus tonight</Text>
        <Text style={styles.loadingText}>Analyzing your stats...</Text>
      </Card>
    );
  }

  const isActionable = insight.actionable;
  const accentColor = isActionable ? colors.warning : colors.success;
  const iconName = isActionable ? 'lightbulb' : 'trending-up';

  return (
    <Card style={[styles.card, isActionable && styles.actionableCard]}>
      <View style={styles.header}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: accentColor + '20' },
          ]}
        >
          <MaterialIcons name={iconName} size={16} color={accentColor} />
        </View>
        <Text style={styles.title}>{insight.title}</Text>
      </View>
      <Text style={styles.message}>{insight.message}</Text>
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      gap: spacing.xs,
      borderLeftWidth: 3,
      borderLeftColor: colors.border,
    },
    actionableCard: {
      borderLeftColor: colors.warning,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    iconContainer: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: typeScale.body,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    message: {
      fontSize: typeScale.body,
      color: colors.textPrimary,
      lineHeight: 20,
      paddingTop: spacing.xs,
    },
    loadingText: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
  });
