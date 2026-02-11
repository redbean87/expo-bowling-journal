import { useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useMemo, useState } from 'react';

import type { Id } from '../../../convex/_generated/dataModel';

import { convexJournalService } from '@/services/journal';

type UploadUrlResponse = {
  r2Key: string;
  uploadUrl: string;
  expiresAt: string;
};

function createIdempotencyKey() {
  return `backup-import-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function useImportBackup() {
  const [selectedFile, setSelectedFile] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [activeBatchId, setActiveBatchId] =
    useState<Id<'importBatches'> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startImportMutation = useMutation(convexJournalService.startImport);
  const importStatus = useQuery(
    convexJournalService.getImportStatus,
    activeBatchId ? { batchId: activeBatchId } : 'skip'
  );

  const pickBackupFile = useCallback(async () => {
    setError(null);

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/octet-stream', 'application/x-sqlite3', '*/*'],
    });

    if (result.canceled) {
      return;
    }

    const [asset] = result.assets;

    if (!asset) {
      setError('No file was selected.');
      return;
    }

    setSelectedFile(asset);
  }, []);

  const startBackupImport = useCallback(
    async (workerBaseUrl: string | null, userId: Id<'users'> | null) => {
      setError(null);

      if (!selectedFile) {
        setError('Pick a backup file first.');
        return;
      }

      if (!workerBaseUrl) {
        setError(
          'Import worker URL is missing. Set EXPO_PUBLIC_IMPORT_WORKER_URL.'
        );
        return;
      }

      if (!userId) {
        setError('Sign in before importing a backup.');
        return;
      }

      const fileSize = selectedFile.size;

      if (
        fileSize === undefined ||
        !Number.isFinite(fileSize) ||
        fileSize <= 0
      ) {
        setError('Selected file size is invalid. Pick another backup file.');
        return;
      }

      setIsUploading(true);

      try {
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

        const uploadPayload =
          (await uploadUrlResponse.json()) as UploadUrlResponse;

        if (!uploadPayload.uploadUrl || !uploadPayload.r2Key) {
          throw new Error('Upload URL response was incomplete.');
        }

        const localFileResponse = await fetch(selectedFile.uri);

        if (!localFileResponse.ok) {
          throw new Error('Could not read selected backup file.');
        }

        const fileBlob = await localFileResponse.blob();
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

        const startResult = await startImportMutation({
          r2Key: uploadPayload.r2Key,
          fileName: selectedFile.name,
          fileSize,
          checksum: null,
          idempotencyKey: createIdempotencyKey(),
        });

        setActiveBatchId(startResult.batchId);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Import failed to start.'
        );
      } finally {
        setIsUploading(false);
      }
    },
    [selectedFile, startImportMutation]
  );

  const selectedFileLabel = useMemo(() => {
    if (!selectedFile) {
      return null;
    }

    return `${selectedFile.name} (${formatBytes(selectedFile.size ?? 0)})`;
  }, [selectedFile]);

  return {
    pickBackupFile,
    startBackupImport,
    selectedFile,
    selectedFileLabel,
    activeBatchId,
    importStatus: importStatus ?? null,
    isUploading,
    error,
  };
}
