import {
  SessionActionsModal,
  type SessionActionTarget,
} from './session-actions-modal';
import { SessionFormModal } from './session-form-modal';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

type SessionModalsPanelProps = {
  modalTranslateY: number;
  canCreateSessionTarget: boolean;

  // Actions modal
  isSessionActionsVisible: boolean;
  sessionActionTarget: SessionActionTarget | null;
  onCloseActions: () => void;
  onRunAction: (action: 'edit' | 'delete', target: SessionActionTarget) => void;

  // Reference data
  ballOptions: ReferenceOption<string>[];
  recentBallOptions: ReferenceOption<string>[];
  patternOptions: ReferenceOption<string>[];
  recentPatternOptions: ReferenceOption<string>[];
  houseOptions: ReferenceOption<string>[];
  recentHouseOptions: ReferenceOption<string>[];
  buildSuggestions: (
    allOptions: ReferenceOption<string>[],
    recentOptions: ReferenceOption<string>[],
    query: string
  ) => ReferenceOption<string>[];
  createBall: (name: string) => Promise<ReferenceOption<string>>;
  createPattern: (name: string) => Promise<ReferenceOption<string>>;
  createHouse: (name: string) => Promise<ReferenceOption<string>>;

  // Create modal
  isCreateModalVisible: boolean;
  isCreatingSessionRequest: boolean;
  sessionDate: string;
  sessionHouseId: string | null;
  sessionPatternId: string | null;
  sessionBallId: string | null;
  sessionError: string | null;
  onCloseCreate: () => void;
  onSubmitCreate: () => void;
  onSessionDateChange: (value: string) => void;
  onSessionHouseSelect: (option: ReferenceOption<string>) => void;
  onSessionPatternSelect: (option: ReferenceOption<string>) => void;
  onSessionBallSelect: (option: ReferenceOption<string>) => void;

  // Edit modal
  isEditModalVisible: boolean;
  isSavingSessionEdit: boolean;
  editingSessionDate: string;
  editingSessionHouseId: string | null;
  editingSessionPatternId: string | null;
  editingSessionBallId: string | null;
  sessionActionError: string | null;
  onCloseEdit: () => void;
  onSubmitEdit: () => void;
  onEditSessionDateChange: (value: string) => void;
  onEditSessionHouseSelect: (option: ReferenceOption<string>) => void;
  onEditSessionPatternSelect: (option: ReferenceOption<string>) => void;
  onEditSessionBallSelect: (option: ReferenceOption<string>) => void;
};

export function SessionModalsPanel({
  modalTranslateY,
  canCreateSessionTarget,
  isSessionActionsVisible,
  sessionActionTarget,
  onCloseActions,
  onRunAction,
  ballOptions,
  recentBallOptions,
  patternOptions,
  recentPatternOptions,
  houseOptions,
  recentHouseOptions,
  buildSuggestions,
  createBall,
  createPattern,
  createHouse,
  isCreateModalVisible,
  isCreatingSessionRequest,
  sessionDate,
  sessionHouseId,
  sessionPatternId,
  sessionBallId,
  sessionError,
  onCloseCreate,
  onSubmitCreate,
  onSessionDateChange,
  onSessionHouseSelect,
  onSessionPatternSelect,
  onSessionBallSelect,
  isEditModalVisible,
  isSavingSessionEdit,
  editingSessionDate,
  editingSessionHouseId,
  editingSessionPatternId,
  editingSessionBallId,
  sessionActionError,
  onCloseEdit,
  onSubmitEdit,
  onEditSessionDateChange,
  onEditSessionHouseSelect,
  onEditSessionPatternSelect,
  onEditSessionBallSelect,
}: SessionModalsPanelProps) {
  return (
    <>
      <SessionActionsModal
        modalTranslateY={modalTranslateY}
        onAction={onRunAction}
        onClose={onCloseActions}
        target={sessionActionTarget}
        visible={isSessionActionsVisible}
      />

      <SessionFormModal
        ballOptions={ballOptions}
        buildSuggestions={buildSuggestions}
        canSubmit={canCreateSessionTarget}
        createBall={createBall}
        createHouse={createHouse}
        createPattern={createPattern}
        houseOptions={houseOptions}
        isSubmitting={isCreatingSessionRequest}
        modalTranslateY={modalTranslateY}
        mode="create"
        onClose={onCloseCreate}
        onSessionBallSelect={onSessionBallSelect}
        onSessionDateChange={onSessionDateChange}
        onSessionHouseSelect={onSessionHouseSelect}
        onSessionPatternSelect={onSessionPatternSelect}
        onSubmit={onSubmitCreate}
        patternOptions={patternOptions}
        recentBallOptions={recentBallOptions}
        recentHouseOptions={recentHouseOptions}
        recentPatternOptions={recentPatternOptions}
        sessionBallId={sessionBallId}
        sessionDate={sessionDate}
        sessionError={sessionError}
        sessionHouseId={sessionHouseId}
        sessionPatternId={sessionPatternId}
        visible={isCreateModalVisible}
      />

      <SessionFormModal
        ballOptions={ballOptions}
        buildSuggestions={buildSuggestions}
        createBall={createBall}
        createHouse={createHouse}
        createPattern={createPattern}
        houseOptions={houseOptions}
        isSubmitting={isSavingSessionEdit}
        modalTranslateY={modalTranslateY}
        mode="edit"
        onClose={onCloseEdit}
        onSessionBallSelect={onEditSessionBallSelect}
        onSessionDateChange={onEditSessionDateChange}
        onSessionHouseSelect={onEditSessionHouseSelect}
        onSessionPatternSelect={onEditSessionPatternSelect}
        onSubmit={onSubmitEdit}
        patternOptions={patternOptions}
        recentBallOptions={recentBallOptions}
        recentHouseOptions={recentHouseOptions}
        recentPatternOptions={recentPatternOptions}
        sessionBallId={editingSessionBallId}
        sessionDate={editingSessionDate}
        sessionError={sessionActionError}
        sessionHouseId={editingSessionHouseId}
        sessionPatternId={editingSessionPatternId}
        visible={isEditModalVisible}
      />
    </>
  );
}
