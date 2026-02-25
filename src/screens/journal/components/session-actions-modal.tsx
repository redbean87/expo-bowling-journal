import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typeScale } from '@/theme/tokens';

type SessionActionTarget = {
  sessionId: string;
  date: string;
  weekNumber: number | null;
  houseId: string | null;
  patternId: string | null;
  ballId: string | null;
  title: string;
};

type SessionActionsModalProps = {
  visible: boolean;
  modalTranslateY: number;
  target: SessionActionTarget | null;
  onClose: () => void;
  onAction: (mode: 'edit' | 'delete', target: SessionActionTarget) => void;
};

export function SessionActionsModal({
  visible,
  modalTranslateY,
  target,
  onClose,
  onAction,
}: SessionActionsModalProps) {
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
              {target?.title ?? 'Session'}
            </Text>
          </View>
          <View style={styles.actionList}>
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
              <Text style={styles.actionItemLabel}>Edit session</Text>
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
              <Text style={styles.actionItemDeleteLabel}>Delete session</Text>
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
