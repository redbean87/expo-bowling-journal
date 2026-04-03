import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { FormModal } from '@/components/form-modal';
import { ReferenceCombobox } from '@/components/reference-combobox';
import { Input } from '@/components/ui';
import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type LeagueFormModalProps = {
  mode: 'create' | 'edit';
  visible: boolean;
  modalTranslateY: number;
  leagueName: string;
  leagueGamesPerSession: string;
  leagueHouseId: string | null;
  leagueError: string | null;
  isSubmitting: boolean;
  houseOptions: ReferenceOption<string>[];
  recentHouseOptions: ReferenceOption<string>[];
  buildSuggestions: (
    allOptions: ReferenceOption<string>[],
    recentOptions: ReferenceOption<string>[],
    query: string
  ) => ReferenceOption<string>[];
  createHouse: (name: string) => Promise<ReferenceOption<string>>;
  onClose: () => void;
  onSubmit: () => void;
  simplified?: boolean;
  onLeagueNameChange: (value: string) => void;
  onGamesPerSessionChange: (value: string) => void;
  onLeagueHouseSelect: (option: ReferenceOption<string>) => void;
  leagueType?: 'league' | 'tournament';
  onLeagueTypeChange?: (type: 'league' | 'tournament') => void;
};

export function LeagueFormModal({
  mode,
  visible,
  modalTranslateY,
  leagueName,
  leagueGamesPerSession,
  leagueHouseId,
  leagueError,
  isSubmitting,
  houseOptions,
  recentHouseOptions,
  buildSuggestions,
  createHouse,
  simplified,
  onClose,
  onSubmit,
  onLeagueNameChange,
  onGamesPerSessionChange,
  onLeagueHouseSelect,
  leagueType = 'league',
  onLeagueTypeChange,
}: LeagueFormModalProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isCreate = mode === 'create';

  const modalTitle = isCreate
    ? leagueType === 'tournament'
      ? 'Create tournament'
      : 'Create league'
    : leagueType === 'tournament'
      ? 'Edit tournament'
      : 'Edit league';

  return (
    <FormModal
      closeAccessibilityLabel={
        isCreate ? 'Close create league dialog' : 'Close edit league dialog'
      }
      error={leagueError}
      isSubmitting={isSubmitting}
      modalTranslateY={modalTranslateY}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={isCreate ? 'Create' : 'Save'}
      submittingLabel={isCreate ? 'Creating...' : 'Saving...'}
      title={modalTitle}
      visible={visible}
    >
      {onLeagueTypeChange && (
        <View style={styles.typePicker}>
          <Pressable
            onPress={() => onLeagueTypeChange('league')}
            style={[
              styles.typeOption,
              styles.typeOptionLeft,
              leagueType === 'league' ? styles.typeOptionActive : null,
            ]}
          >
            <Text
              style={[
                styles.typeOptionLabel,
                leagueType === 'league' ? styles.typeOptionLabelActive : null,
              ]}
            >
              League
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onLeagueTypeChange('tournament')}
            style={[
              styles.typeOption,
              styles.typeOptionRight,
              leagueType === 'tournament' ? styles.typeOptionActive : null,
            ]}
          >
            <Text
              style={[
                styles.typeOptionLabel,
                leagueType === 'tournament'
                  ? styles.typeOptionLabelActive
                  : null,
              ]}
            >
              Tournament
            </Text>
          </Pressable>
        </View>
      )}
      <Input
        autoCapitalize="words"
        autoCorrect={false}
        onChangeText={onLeagueNameChange}
        placeholder={
          leagueType === 'tournament' ? 'Tournament name' : 'League name'
        }
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
      {!simplified && (
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
      )}
    </FormModal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    typePicker: {
      flexDirection: 'row',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: colors.surfaceSubtle,
    },
    typeOption: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    typeOptionLeft: {
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
    },
    typeOptionRight: {},
    typeOptionActive: {
      backgroundColor: colors.accent,
    },
    typeOptionLabel: {
      fontSize: typeScale.body,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    typeOptionLabelActive: {
      color: colors.accentText,
      fontWeight: '600',
    },
  });
