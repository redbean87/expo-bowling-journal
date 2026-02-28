import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { QueueSyncState } from '@/screens/game-editor/game-save-queue-status';

import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type SyncStatusChipProps = {
  state: QueueSyncState;
  label: string;
  onPress: () => void;
};

export function SyncStatusChip({ state, label, onPress }: SyncStatusChipProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View sync status"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        state === 'attention' ? styles.attention : null,
        state === 'syncing' ? styles.syncing : null,
        state === 'retrying' ? styles.retrying : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text
        style={[
          styles.label,
          state === 'syncing' ? styles.syncingLabel : null,
          state === 'retrying' ? styles.retryingLabel : null,
          state === 'attention' ? styles.attentionLabel : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    syncing: {
      borderColor: colors.accent,
      backgroundColor: colors.accentMuted,
    },
    retrying: {
      borderColor: colors.warningBorder,
      backgroundColor: colors.warningMuted,
    },
    attention: {
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerMuted,
    },
    pressed: {
      opacity: 0.8,
    },
    label: {
      fontSize: typeScale.bodySm,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    syncingLabel: {
      color: colors.accent,
    },
    retryingLabel: {
      color: colors.textPrimary,
    },
    attentionLabel: {
      color: colors.danger,
    },
  });
