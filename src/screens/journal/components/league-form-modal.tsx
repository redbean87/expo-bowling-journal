import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { FormModal } from '@/components/form-modal';
import { ReferenceCombobox } from '@/components/reference-combobox';
import { Input } from '@/components/ui';

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
  onLeagueNameChange: (value: string) => void;
  onGamesPerSessionChange: (value: string) => void;
  onLeagueHouseSelect: (option: ReferenceOption<string>) => void;
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
  onClose,
  onSubmit,
  onLeagueNameChange,
  onGamesPerSessionChange,
  onLeagueHouseSelect,
}: LeagueFormModalProps) {
  const isCreate = mode === 'create';

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
      title={isCreate ? 'Create league' : 'Edit league'}
      visible={visible}
    >
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
    </FormModal>
  );
}
