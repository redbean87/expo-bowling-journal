import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { ReferenceCombobox } from '@/components/reference-combobox';
import { Button, Input } from '@/components/ui';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type CreateLeagueModalProps = {
  visible: boolean;
  modalTranslateY: number;
  leagueName: string;
  leagueGamesPerSession: string;
  leagueHouseId: string | null;
  leagueError: string | null;
  isCreatingLeagueRequest: boolean;
  houseOptions: ReferenceOption<string>[];
  recentHouseOptions: ReferenceOption<string>[];
  buildSuggestions: (
    allOptions: ReferenceOption<string>[],
    recentOptions: ReferenceOption<string>[],
    query: string
  ) => ReferenceOption<string>[];
  createHouse: (name: string) => Promise<ReferenceOption<string>>;
  onClose: () => void;
  onCreate: () => void;
  onLeagueNameChange: (value: string) => void;
  onGamesPerSessionChange: (value: string) => void;
  onLeagueHouseSelect: (option: ReferenceOption<string>) => void;
};

export function CreateLeagueModal({
  visible,
  modalTranslateY,
  leagueName,
  leagueGamesPerSession,
  leagueHouseId,
  leagueError,
  isCreatingLeagueRequest,
  houseOptions,
  recentHouseOptions,
  buildSuggestions,
  createHouse,
  onClose,
  onCreate,
  onLeagueNameChange,
  onGamesPerSessionChange,
  onLeagueHouseSelect,
}: CreateLeagueModalProps) {
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
            <Text style={styles.modalTitle}>Create league</Text>
            <Pressable
              accessibilityLabel="Close create league dialog"
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
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={onLeagueNameChange}
            placeholder="League name"
            value={leagueName}
          />
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            onChangeText={onGamesPerSessionChange}
            placeholder="Games per session (optional)"
            value={leagueGamesPerSession}
          />
          <ReferenceCombobox
            allOptions={houseOptions}
            createLabel="Add house"
            getSuggestions={buildSuggestions}
            onQuickAdd={createHouse}
            onSelect={onLeagueHouseSelect}
            placeholder="House (optional)"
            recentOptions={recentHouseOptions}
            valueId={leagueHouseId}
          />
          {leagueError ? (
            <Text style={styles.errorText}>{leagueError}</Text>
          ) : null}
          <View style={styles.modalActions}>
            <View style={styles.modalActionButton}>
              <Button
                disabled={isCreatingLeagueRequest}
                label={isCreatingLeagueRequest ? 'Creating...' : 'Create'}
                onPress={onCreate}
                variant="secondary"
              />
            </View>
            <View style={styles.modalActionButton}>
              <Button
                disabled={isCreatingLeagueRequest}
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
