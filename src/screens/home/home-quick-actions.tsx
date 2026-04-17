import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type QuickAction = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
};

type HomeQuickActionsProps = {
  context: 'league-day' | 'off-night' | 'empty';
  disabled?: boolean;
};

export function HomeQuickActions({ context, disabled }: HomeQuickActionsProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const actions: QuickAction[] = useMemo(() => {
    const baseActions: QuickAction[] = [
      {
        id: 'practice',
        label: 'Log Practice',
        icon: 'sports',
        onPress: () => {
          router.push('/journal?startOpenBowling=1' as never);
        },
      },
      {
        id: 'journal',
        label: 'View Journal',
        icon: 'menu-book',
        onPress: () => {
          router.push('/journal' as never);
        },
      },
      {
        id: 'analytics',
        label: 'View Analytics',
        icon: 'insights',
        onPress: () => {
          router.push('/analytics' as never);
        },
      },
    ];

    if (context === 'empty') {
      // On empty state, no quick actions needed (buttons handle navigation)
      return [];
    }

    return baseActions;
  }, [context]);

  if (actions.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quick actions</Text>
      <View style={styles.actionsGrid}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            disabled={disabled}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.actionRow,
              pressed ? styles.actionRowPressed : null,
              disabled ? styles.actionRowDisabled : null,
            ]}
          >
            <MaterialIcons
              name={action.icon}
              size={18}
              color={colors.textSecondary}
              style={styles.actionIcon}
            />
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.xs,
    },
    title: {
      fontSize: typeScale.body,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    actionsGrid: {
      gap: spacing.xs,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionRowPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    actionRowDisabled: {
      opacity: 0.5,
    },
    actionIcon: {
      width: 24,
      textAlign: 'center',
    },
    actionLabel: {
      fontSize: typeScale.body,
      fontWeight: '500',
      color: colors.textPrimary,
    },
  });
