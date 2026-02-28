import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { ReferenceCombobox } from '@/components/reference-combobox';
import { Button, Input } from '@/components/ui';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type CreateSessionModalProps = {
  visible: boolean;
  modalTranslateY: number;
  sessionDate: string;
  sessionWeekNumber: string;
  sessionHouseId: string | null;
  sessionPatternId: string | null;
  sessionBallId: string | null;
  sessionError: string | null;
  isCreatingSessionRequest: boolean;
  canCreateSessionTarget: boolean;
  houseOptions: ReferenceOption<string>[];
  recentHouseOptions: ReferenceOption<string>[];
  patternOptions: ReferenceOption<string>[];
  recentPatternOptions: ReferenceOption<string>[];
  ballOptions: ReferenceOption<string>[];
  recentBallOptions: ReferenceOption<string>[];
  buildSuggestions: (
    allOptions: ReferenceOption<string>[],
    recentOptions: ReferenceOption<string>[],
    query: string
  ) => ReferenceOption<string>[];
  createHouse: (name: string) => Promise<ReferenceOption<string>>;
  createPattern: (name: string) => Promise<ReferenceOption<string>>;
  createBall: (name: string) => Promise<ReferenceOption<string>>;
  onClose: () => void;
  onCreate: () => void;
  onSessionDateChange: (value: string) => void;
  onSessionWeekNumberChange: (value: string) => void;
  onSessionHouseSelect: (option: ReferenceOption<string>) => void;
  onSessionPatternSelect: (option: ReferenceOption<string>) => void;
  onSessionBallSelect: (option: ReferenceOption<string>) => void;
};

export function CreateSessionModal({
  visible,
  modalTranslateY,
  sessionDate,
  sessionWeekNumber,
  sessionHouseId,
  sessionPatternId,
  sessionBallId,
  sessionError,
  isCreatingSessionRequest,
  canCreateSessionTarget,
  houseOptions,
  recentHouseOptions,
  patternOptions,
  recentPatternOptions,
  ballOptions,
  recentBallOptions,
  buildSuggestions,
  createHouse,
  createPattern,
  createBall,
  onClose,
  onCreate,
  onSessionDateChange,
  onSessionWeekNumberChange,
  onSessionHouseSelect,
  onSessionPatternSelect,
  onSessionBallSelect,
}: CreateSessionModalProps) {
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
            <Text style={styles.modalTitle}>Create session</Text>
            <Pressable
              accessibilityLabel="Close create session dialog"
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
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onSessionDateChange}
            placeholder="YYYY-MM-DD"
            value={sessionDate}
          />
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            onChangeText={onSessionWeekNumberChange}
            placeholder="Week number (optional)"
            value={sessionWeekNumber}
          />
          <ReferenceCombobox
            allOptions={houseOptions}
            createLabel="Add house"
            getSuggestions={buildSuggestions}
            onQuickAdd={createHouse}
            onSelect={onSessionHouseSelect}
            placeholder="House (optional)"
            recentOptions={recentHouseOptions}
            valueId={sessionHouseId}
          />
          <ReferenceCombobox
            allOptions={patternOptions}
            createLabel="Add pattern"
            getSuggestions={buildSuggestions}
            onQuickAdd={createPattern}
            onSelect={onSessionPatternSelect}
            placeholder="Pattern (optional)"
            recentOptions={recentPatternOptions}
            valueId={sessionPatternId}
          />
          <ReferenceCombobox
            allOptions={ballOptions}
            createLabel="Add ball"
            getSuggestions={buildSuggestions}
            onQuickAdd={createBall}
            onSelect={onSessionBallSelect}
            placeholder="Ball (optional)"
            recentOptions={recentBallOptions}
            valueId={sessionBallId}
          />
          {sessionError ? (
            <Text style={styles.errorText}>{sessionError}</Text>
          ) : null}
          <View style={styles.modalActions}>
            <View style={styles.modalActionButton}>
              <Button
                disabled={isCreatingSessionRequest || !canCreateSessionTarget}
                label={isCreatingSessionRequest ? 'Creating...' : 'Create'}
                onPress={onCreate}
                variant="secondary"
              />
            </View>
            <View style={styles.modalActionButton}>
              <Button
                disabled={isCreatingSessionRequest}
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
