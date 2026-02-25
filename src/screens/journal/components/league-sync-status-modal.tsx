import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { QueueSyncStatus } from '@/screens/game-editor/game-save-queue-status';

import { Button } from '@/components/ui';
import { colors, spacing, typeScale } from '@/theme/tokens';

type LeagueSyncStatusModalProps = {
  visible: boolean;
  modalTranslateY: number;
  queueStatus: QueueSyncStatus;
  now: number;
  isRetryingNow: boolean;
  formatRelativeTime: (timestamp: number | null, now: number) => string | null;
  formatRetryTime: (timestamp: number | null, now: number) => string | null;
  onRetryNow: () => void;
  onClose: () => void;
};

export function LeagueSyncStatusModal({
  visible,
  modalTranslateY,
  queueStatus,
  now,
  isRetryingNow,
  formatRelativeTime,
  formatRetryTime,
  onRetryNow,
  onClose,
}: LeagueSyncStatusModalProps) {
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
            { transform: [{ translateY: modalTranslateY }] },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sync status</Text>
            <Pressable
              accessibilityLabel="Close sync status dialog"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.modalCloseButton,
                pressed ? styles.modalCloseButtonPressed : null,
              ]}
            >
              <Text style={styles.modalCloseLabel}>X</Text>
            </Pressable>
          </View>
          <Text style={styles.meta}>
            Queued saves: {queueStatus.queuedCount}
          </Text>
          {queueStatus.oldestPendingAt ? (
            <Text style={styles.meta}>
              Oldest pending:{' '}
              {formatRelativeTime(queueStatus.oldestPendingAt, now)}
            </Text>
          ) : null}
          {queueStatus.nextRetryAt ? (
            <Text style={styles.meta}>
              Next retry: {formatRetryTime(queueStatus.nextRetryAt, now)}
            </Text>
          ) : null}
          {queueStatus.latestActionableError ? (
            <Text style={styles.errorText}>
              {queueStatus.latestActionableError}
            </Text>
          ) : null}
          <View style={styles.modalActions}>
            <View style={styles.modalActionButton}>
              <Button
                disabled={
                  isRetryingNow ||
                  queueStatus.queuedCount === 0 ||
                  queueStatus.state === 'syncing'
                }
                label={isRetryingNow ? 'Retrying...' : 'Retry now'}
                onPress={onRetryNow}
                variant="secondary"
              />
            </View>
            <View style={styles.modalActionButton}>
              <Button label="Close" onPress={onClose} variant="ghost" />
            </View>
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: typeScale.titleSm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCloseButtonPressed: {
    opacity: 0.8,
  },
  modalCloseLabel: {
    fontSize: typeScale.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  meta: {
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: typeScale.bodySm,
    color: colors.danger,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  modalActionButton: {
    flex: 1,
  },
});
