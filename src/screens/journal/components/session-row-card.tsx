import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type SessionRowCardProps = {
  isDeleting: boolean;
  sessionWeekLabel: string;
  _sessionDateLabel: string;
  onNavigate: () => void;
  onOpenActions: () => void;
  gameCount?: number;
  seriesTotal?: number;
  average?: number;
  highGame?: number;
};

export function SessionRowCard({
  isDeleting,
  sessionWeekLabel,
  _sessionDateLabel,
  onNavigate,
  onOpenActions,
  gameCount,
  seriesTotal,
  average,
  highGame,
}: SessionRowCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const hasStats = gameCount !== undefined && gameCount > 0;

  const formatStats = () => {
    if (!hasStats) return null;
    const parts: string[] = [];
    if (gameCount !== undefined) {
      parts.push(`${gameCount} game${gameCount === 1 ? '' : 's'}`);
    }
    if (seriesTotal !== undefined) {
      parts.push(`${seriesTotal} series`);
    }
    if (average !== undefined) {
      parts.push(`${average} avg`);
    }
    if (highGame !== undefined) {
      parts.push(`${highGame} high`);
    }
    return parts.join(' • ');
  };

  const statsText = formatStats();

  return (
    <Card style={styles.rowCard}>
      <View style={styles.rowHeader}>
        <Pressable
          style={({ pressed }) => [
            styles.sessionContent,
            pressed ? styles.rowPressed : null,
          ]}
          onPress={onNavigate}
        >
          <Text style={styles.rowTitle}>{sessionWeekLabel}</Text>
          {statsText ? <Text style={styles.stats}>{statsText}</Text> : null}
        </Pressable>
        <Pressable
          accessibilityLabel={`Session actions for ${sessionWeekLabel}`}
          disabled={isDeleting}
          hitSlop={8}
          onPress={onOpenActions}
          style={({ pressed }) => [
            styles.menuButton,
            pressed ? styles.menuButtonPressed : null,
          ]}
        >
          <MaterialIcons
            name="more-vert"
            size={22}
            color={colors.textPrimary}
          />
        </Pressable>
      </View>
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    rowTitle: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    rowPressed: {
      opacity: 0.82,
    },
    rowHeader: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
    },
    sessionContent: {
      flex: 1,
    },
    menuButton: {
      width: 40,
      height: 44,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    menuButtonPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    meta: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
    stats: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    rowCard: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: 10,
      gap: spacing.xs,
    },
  });
