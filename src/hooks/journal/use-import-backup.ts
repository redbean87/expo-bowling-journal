import { useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { pickBackupFileOnWeb } from './import-backup/file-picker-web';
import {
  type SelectedBackupFile,
  uploadBackupFileAndStartImport,
} from './import-backup/import-upload-client';

import type { Id } from '../../../convex/_generated/dataModel';

import { convexJournalService } from '@/services/journal';

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
  const [selectedFile, setSelectedFile] = useState<SelectedBackupFile | null>(
    null
  );
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

    if (Platform.OS === 'web') {
      const webFile = await pickBackupFileOnWeb();

      if (!webFile) {
        return;
      }

      setSelectedFile({
        name: webFile.name,
        size: webFile.size,
        uri: null,
        mimeType: webFile.type || null,
        webFile,
      });
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });

    if (result.canceled) {
      return;
    }

    const [asset] = result.assets;

    if (!asset) {
      setError('No file was selected.');
      return;
    }

    setSelectedFile({
      name: asset.name,
      size: asset.size ?? 0,
      uri: asset.uri,
      mimeType: asset.mimeType ?? null,
      webFile: null,
    });
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
        const startResult = await uploadBackupFileAndStartImport({
          workerBaseUrl,
          userId,
          selectedFile,
          startImport: startImportMutation,
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
