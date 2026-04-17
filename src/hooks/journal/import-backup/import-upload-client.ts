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

function sanitizeCacheSegment(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  const trimmed = sanitized.replace(/^-+|-+$/g, '');

  return trimmed.length > 0 ? trimmed : 'backup.sqlite3';
}

async function readBlobFromUri(uri: string): Promise<Blob> {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error('Could not read selected backup file.');
  }

  return response.blob();
}

async function readBlobFromCacheCopy(
  selectedFile: SelectedBackupFile
): Promise<Blob> {
  if (!selectedFile.uri) {
    throw new Error('Selected file is missing a readable URI.');
  }

  const fileSystem = await import('expo-file-system/legacy');

  if (!fileSystem.cacheDirectory) {
    throw new Error('Could not read selected backup file.');
  }

  const cacheFileName = sanitizeCacheSegment(selectedFile.name);
  const cacheCopyUri = `${fileSystem.cacheDirectory}import-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}-${cacheFileName}`;

  await fileSystem.copyAsync({
    from: selectedFile.uri,
    to: cacheCopyUri,
  });

  try {
    return await readBlobFromUri(cacheCopyUri);
  } finally {
    await fileSystem
      .deleteAsync(cacheCopyUri, { idempotent: true })
      .catch(() => undefined);
  }
}

async function toUploadBlob(selectedFile: SelectedBackupFile): Promise<Blob> {
  if (selectedFile.webFile) {
    return selectedFile.webFile;
  }

  if (!selectedFile.uri) {
    throw new Error('Selected file is missing a readable URI.');
  }

  try {
    return await readBlobFromUri(selectedFile.uri);
  } catch {
    try {
      return await readBlobFromCacheCopy(selectedFile);
    } catch {
      throw new Error('Could not read selected backup file.');
    }
  }
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
  console.log('[Import Debug] Starting backup validation for upload:', {
    fileName: selectedFile.name,
    fileSize: selectedFile.size,
  });
  const isSupportedBackup = await isSupportedBackupBlob(fileBlob);

  if (!isSupportedBackup) {
    console.log(
      '[Import Debug] Upload validation failed: File is not a supported SQLite backup'
    );
    throw new Error(
      'Invalid backup file: Not a supported SQLite database format.'
    );
  }
  console.log('[Import Debug] Backup validation passed');

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
