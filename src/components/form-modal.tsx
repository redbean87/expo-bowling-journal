import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type FormModalProps = {
  visible: boolean;
  modalTranslateY: number;
  title: string;
  closeAccessibilityLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submittingLabel: string;
  isSubmitting: boolean;
  canSubmit?: boolean;
  error: string | null;
  children: ReactNode;
};

export function FormModal({
  visible,
  modalTranslateY,
  title,
  closeAccessibilityLabel,
  onClose,
  onSubmit,
  submitLabel,
  submittingLabel,
  isSubmitting,
  canSubmit = true,
  error,
  children,
}: FormModalProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      animationType="slide"
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
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable
              accessibilityLabel={closeAccessibilityLabel}
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
          {children}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.modalActions}>
            <View style={styles.modalActionButton}>
              <Button
                disabled={isSubmitting || !canSubmit}
                label={isSubmitting ? submittingLabel : submitLabel}
                onPress={onSubmit}
                variant="secondary"
              />
            </View>
            <View style={styles.modalActionButton}>
              <Button
                disabled={isSubmitting}
                label="Cancel"
                onPress={onClose}
                variant="ghost"
              />
            </View>
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
