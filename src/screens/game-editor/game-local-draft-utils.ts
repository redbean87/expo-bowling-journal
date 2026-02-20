type ShouldRestoreLocalDraftInput = {
  isCreateMode: boolean;
  incomingServerSignature: string;
  localDraftSignature: string;
  localDraftBaseServerSignature: string | null;
};

export function shouldRestoreLocalDraft({
  isCreateMode,
  incomingServerSignature,
  localDraftSignature,
  localDraftBaseServerSignature,
}: ShouldRestoreLocalDraftInput) {
  if (localDraftSignature === incomingServerSignature) {
    return false;
  }

  if (isCreateMode) {
    return true;
  }

  return localDraftBaseServerSignature === incomingServerSignature;
}
