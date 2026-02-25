import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typeScale } from '@/theme/tokens';

type LeagueActionTarget = {
  leagueId: string;
  name: string;
  gamesPerSession: number | null;
  houseId: string | null;
};

type LeagueActionsModalProps = {
  visible: boolean;
  modalTranslateY: number;
  target: LeagueActionTarget | null;
  onClose: () => void;
  onAction: (
    mode: 'quick-start' | 'edit' | 'delete',
    target: LeagueActionTarget
  ) => void;
};

export function LeagueActionsModal({
  visible,
  modalTranslateY,
  target,
  onClose,
  onAction,
}: LeagueActionsModalProps) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalBackdropHitbox} onPress={onClose} />
        <View
          style={[
            styles.modalCard,
            styles.actionModalCard,
            { transform: [{ translateY: modalTranslateY }] },
          ]}
        >
          <View style={styles.actionModalHeader}>
            <Text numberOfLines={1} style={styles.actionModalTitle}>
              {target?.name ?? 'League'}
            </Text>
          </View>
          <View style={styles.actionList}>
            <Pressable
              onPress={() => {
                if (!target) {
                  return;
                }

                onClose();
                onAction('quick-start', target);
              }}
              style={({ pressed }) => [
                styles.actionItem,
                styles.actionItemWithDivider,
                pressed ? styles.actionItemPressed : null,
              ]}
            >
              <Text style={styles.actionItemLabel}>Quick start</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!target) {
                  return;
                }

                onClose();
                onAction('edit', target);
              }}
              style={({ pressed }) => [
                styles.actionItem,
                styles.actionItemWithDivider,
                pressed ? styles.actionItemPressed : null,
              ]}
            >
              <Text style={styles.actionItemLabel}>Edit league</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!target) {
                  return;
                }

                onClose();
                onAction('delete', target);
              }}
              style={({ pressed }) => [
                styles.actionItem,
                styles.actionItemWithDivider,
                pressed ? styles.actionItemPressed : null,
              ]}
            >
              <Text style={styles.actionItemDeleteLabel}>Delete league</Text>
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

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(26, 31, 43, 0.35)',
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
    backgroundColor: colors.surface,
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
  actionItemLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.textPrimary,
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
