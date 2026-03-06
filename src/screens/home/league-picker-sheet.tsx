import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type League = {
  _id: string;
  name: string;
  houseName: string | null;
};

type LeaguePickerSheetProps = {
  visible: boolean;
  leagues: League[];
  selectedLeagueId: string | null;
  onClose: () => void;
  onSelect: (leagueId: string) => void;
};

export function LeaguePickerSheet({
  visible,
  leagues,
  selectedLeagueId,
  onClose,
  onSelect,
}: LeaguePickerSheetProps) {
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
        <View style={[styles.modalCard, styles.pickerCard]}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select league</Text>
          </View>
          <View style={styles.pickerList}>
            {leagues.map((league) => (
              <Pressable
                key={league._id}
                onPress={() => onSelect(league._id)}
                style={({ pressed }) => [
                  styles.pickerItem,
                  selectedLeagueId === league._id
                    ? styles.pickerItemSelected
                    : null,
                  pressed ? styles.pickerItemPressed : null,
                ]}
              >
                <View style={styles.pickerItemContent}>
                  <Text
                    style={[
                      styles.pickerItemLabel,
                      selectedLeagueId === league._id
                        ? styles.pickerItemLabelSelected
                        : null,
                    ]}
                  >
                    {league.name}
                  </Text>
                  <Text style={styles.pickerItemMeta}>
                    {league.houseName ?? 'No house set'}
                  </Text>
                </View>
                {selectedLeagueId === league._id && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed ? styles.cancelButtonPressed : null,
            ]}
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
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
      borderRadius: 18,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pickerCard: {
      padding: spacing.md,
      gap: spacing.md,
    },
    pickerHeader: {
      paddingBottom: spacing.xs,
    },
    pickerTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'center',
    },
    pickerList: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: colors.surfaceSubtle,
    },
    pickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: 'transparent',
    },
    pickerItemSelected: {
      backgroundColor: colors.accentMuted,
    },
    pickerItemPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    pickerItemContent: {
      flex: 1,
      gap: 2,
    },
    pickerItemLabel: {
      fontSize: typeScale.body,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    pickerItemLabelSelected: {
      color: colors.accent,
    },
    pickerItemMeta: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    checkmark: {
      fontSize: typeScale.body,
      color: colors.accent,
      fontWeight: '700',
    },
    cancelButton: {
      paddingVertical: spacing.sm,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelButtonPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    cancelLabel: {
      fontSize: typeScale.body,
      fontWeight: '500',
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
