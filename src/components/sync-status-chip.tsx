import { Pressable, StyleSheet, Text } from 'react-native';

import type { QueueSyncState } from '@/screens/game-editor/game-save-queue-status';

import { colors, spacing, typeScale } from '@/theme/tokens';

type SyncStatusChipProps = {
  state: QueueSyncState;
  label: string;
  onPress: () => void;
};

export function SyncStatusChip({ state, label, onPress }: SyncStatusChipProps) {
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
          state === 'attention' ? styles.attentionLabel : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    borderColor: '#E2D2A7',
    backgroundColor: '#FFF8E6',
  },
  attention: {
    borderColor: '#E8C5C2',
    backgroundColor: '#FEF5F4',
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: typeScale.bodySm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  attentionLabel: {
    color: colors.danger,
  },
});
