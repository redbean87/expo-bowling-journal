import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type GameActionTarget = {
  gameId: string | null;
  queueId: string | null;
  label: string;
  title: string;
};

type GameActionsModalProps = {
  visible: boolean;
  target: GameActionTarget | null;
  onClose: () => void;
  onDelete: (target: GameActionTarget) => void;
};

export function GameActionsModal({
  visible,
  target,
  onClose,
  onDelete,
}: GameActionsModalProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalBackdropHitbox} onPress={onClose} />
        <View style={[styles.modalCard, styles.actionModalCard]}>
          <View style={styles.actionModalHeader}>
            <Text numberOfLines={1} style={styles.actionModalTitle}>
              {target?.title ?? 'Game'}
            </Text>
          </View>
          <View style={styles.actionList}>
            <Pressable
              onPress={() => {
                if (!target) {
                  return;
                }

                onClose();
                onDelete(target);
              }}
              style={({ pressed }) => [
                styles.actionItem,
                styles.actionItemWithDivider,
                pressed ? styles.actionItemPressed : null,
              ]}
            >
              <Text style={styles.actionItemDeleteLabel}>Delete game</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.actionItem,
                styles.actionItemCancel,
                pressed ? styles.actionItemPressed : null,
              ]}
            >
              <Text style={styles.actionItemCancelLabel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      backgroundColor: colors.overlay,
    },
    modalBackdropHitbox: {
      ...StyleSheet.absoluteFillObject,
    },
    modalCard: {
      width: '100%',
      maxWidth: 520,
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: 18,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    actionModalCard: {
      gap: spacing.xs,
      padding: spacing.md,
    },
    actionModalHeader: {
      paddingTop: 2,
    },
    actionModalTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    actionList: {
      marginTop: spacing.xs,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: colors.surfaceSubtle,
    },
    actionItem: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    actionItemWithDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    actionItemCancel: {
      backgroundColor: colors.surface,
    },
    actionItemPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    actionItemDeleteLabel: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.danger,
    },
    actionItemCancelLabel: {
      fontSize: typeScale.body,
      fontWeight: '500',
      color: colors.textSecondary,
    },
  });
