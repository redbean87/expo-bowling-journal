import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { FormModal } from '@/components/form-modal';
import { ReferenceCombobox } from '@/components/reference-combobox';
import { Input } from '@/components/ui';

type SessionFormModalProps = {
  mode: 'create' | 'edit';
  visible: boolean;
  modalTranslateY: number;
  sessionDate: string;
  sessionHouseId: string | null;
  sessionPatternId: string | null;
  sessionBallId: string | null;
  sessionError: string | null;
  isSubmitting: boolean;
  canSubmit?: boolean;
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
  onSubmit: () => void;
  onSessionDateChange: (value: string) => void;
  onSessionHouseSelect: (option: ReferenceOption<string>) => void;
  onSessionPatternSelect: (option: ReferenceOption<string>) => void;
  onSessionBallSelect: (option: ReferenceOption<string>) => void;
};

export function SessionFormModal({
  mode,
  visible,
  modalTranslateY,
  sessionDate,
  sessionHouseId,
  sessionPatternId,
  sessionBallId,
  sessionError,
  isSubmitting,
  canSubmit = true,
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
  onSubmit,
  onSessionDateChange,
  onSessionHouseSelect,
  onSessionPatternSelect,
  onSessionBallSelect,
}: SessionFormModalProps) {
  const isCreate = mode === 'create';

  return (
    <FormModal
      canSubmit={canSubmit}
      closeAccessibilityLabel={
        isCreate ? 'Close create session dialog' : 'Close edit session dialog'
      }
      error={sessionError}
      isSubmitting={isSubmitting}
      modalTranslateY={modalTranslateY}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={isCreate ? 'Create' : 'Save'}
      submittingLabel={isCreate ? 'Creating...' : 'Saving...'}
      title={isCreate ? 'Create session' : 'Edit session'}
      visible={visible}
    >
      <Input
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onSessionDateChange}
        placeholder="YYYY-MM-DD"
        value={sessionDate}
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
    </FormModal>
  );
}
