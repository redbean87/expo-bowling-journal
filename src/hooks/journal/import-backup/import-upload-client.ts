import { isSupportedBackupBlob } from './file-validation';

import type { Id } from '../../../../convex/_generated/dataModel';

type UploadUrlResponse = {
  r2Key: string;
  uploadUrl: string;
  expiresAt: string;
};

export type SelectedBackupFile = {
  name: string;
  size: number;
  uri: string | null;
  mimeType: string | null;
  webFile: File | null;
};

type StartImportResult = {
  batchId: Id<'importBatches'>;
};

type UploadBackupFileInput = {
  workerBaseUrl: string;
  userId: Id<'users'>;
  selectedFile: SelectedBackupFile;
  startImport: (args: {
    r2Key: string;
    fileName: string;
    fileSize: number;
    checksum: string | null;
    idempotencyKey: string;
    timezoneOffsetMinutes: number;
  }) => Promise<StartImportResult>;
};

function createIdempotencyKey() {
  return `backup-import-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

async function toUploadBlob(selectedFile: SelectedBackupFile): Promise<Blob> {
  if (selectedFile.webFile) {
    return selectedFile.webFile;
  }

  if (!selectedFile.uri) {
    throw new Error('Selected file is missing a readable URI.');
  }

  const localFileResponse = await fetch(selectedFile.uri);

  if (!localFileResponse.ok) {
    throw new Error('Could not read selected backup file.');
  }

  return localFileResponse.blob();
}

export async function uploadBackupFileAndStartImport({
  workerBaseUrl,
  userId,
  selectedFile,
  startImport,
}: UploadBackupFileInput): Promise<StartImportResult> {
  const fileSize = selectedFile.size;

  if (fileSize === undefined || !Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error('Selected file size is invalid. Pick another backup file.');
  }

  const normalizedBaseUrl = workerBaseUrl.replace(/\/+$/, '');
  const uploadUrlResponse = await fetch(
    `${normalizedBaseUrl}/imports/upload-url`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        fileName: selectedFile.name,
        fileSize,
      }),
    }
  );

  if (!uploadUrlResponse.ok) {
    throw new Error('Could not initialize backup upload.');
  }

  const uploadPayload = (await uploadUrlResponse.json()) as UploadUrlResponse;

  if (!uploadPayload.uploadUrl || !uploadPayload.r2Key) {
    throw new Error('Upload URL response was incomplete.');
  }

  const fileBlob = await toUploadBlob(selectedFile);
  const isSupportedBackup = await isSupportedBackupBlob(fileBlob);

  if (!isSupportedBackup) {
    throw new Error('Selected file is not a supported PinPal SQLite backup.');
  }

  const uploadResponse = await fetch(uploadPayload.uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'application/octet-stream',
    },
    body: fileBlob,
  });

  if (!uploadResponse.ok) {
    throw new Error('Backup upload failed.');
  }

  return startImport({
    r2Key: uploadPayload.r2Key,
    fileName: selectedFile.name,
    fileSize,
    checksum: null,
    idempotencyKey: createIdempotencyKey(),
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
}
