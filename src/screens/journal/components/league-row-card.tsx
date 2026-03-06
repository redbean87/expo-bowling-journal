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

type DisplayLeague = {
  id: string;
  leagueId: string | null;
  name: string;
  houseName: string | null;
  houseId: string | null;
  gamesPerSession: number | null;
  isDraft: boolean;
};

type LeagueRowCardProps = {
  league: DisplayLeague;
  isDeleting: boolean;
  onNavigate: () => void;
  onOpenActions: () => void;
};

export function LeagueRowCard({
  league,
  isDeleting,
  onNavigate,
  onOpenActions,
}: LeagueRowCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Card style={styles.rowCard}>
      <View style={styles.rowHeader}>
        <Pressable
          onPress={onNavigate}
          style={({ pressed }) => [
            styles.leagueContent,
            pressed ? styles.leagueContentPressed : null,
          ]}
        >
          <Text style={styles.rowTitle}>{league.name}</Text>
          <Text style={styles.meta}>{league.houseName ?? 'No house set'}</Text>
          <Text style={styles.meta}>
            Target games: {league.gamesPerSession ?? 'Not set'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel={`League actions for ${league.name}`}
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
    leagueContent: {
      gap: spacing.xs,
      flex: 1,
    },
    leagueContentPressed: {
      opacity: 0.82,
    },
    rowHeader: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
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
    rowCard: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: 10,
      gap: spacing.xs,
    },
    meta: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
  });
