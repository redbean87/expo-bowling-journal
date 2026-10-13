import { useMutation } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { pickBackupFileOnWeb } from './import-backup/file-picker-web';
import {
  type SelectedBackupFile,
  uploadBackupFileAndStartImport,
} from './import-backup/import-upload-client';

import type { Id } from '../../../convex/_generated/dataModel';

import { isConnectivityOffline } from '@/services/connectivity';
import { convexJournalService } from '@/services/journal';

/**
 * Local-first import job state (C-1d).
 *
 * The profile's import status renders from this job state instead of a
 * Convex read: a started import enters the transition rules in their
 * first state, `queued`; the transition rules (`queued -> parsing ->
 * importing -> completed|failed`) and the snapshot transport live in the
 * import pipeline and are unchanged.
 */
type LocalImportStatus = {
  batchId: Id<'importBatches'>;
  status: 'queued' | 'parsing' | 'importing' | 'completed' | 'failed';
  sourceFileName: string;
  fileSize: number;
  importedAt: number;
  completedAt: number | null;
  errorMessage: string | null;
  counts: {
    houses: number;
    leagues: number;
    weeks: number;
    sessions: number;
    balls: number;
    games: number;
    frames: number;
    patterns: number;
    gamesRefined: number;
    gamesPatched: number;
    warnings: number;
  };
};

const EMPTY_IMPORT_COUNTS: LocalImportStatus['counts'] = {
  houses: 0,
  leagues: 0,
  weeks: 0,
  sessions: 0,
  balls: 0,
  games: 0,
  frames: 0,
  patterns: 0,
  gamesRefined: 0,
  gamesPatched: 0,
  warnings: 0,
};

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

async function resolveNativeFileSize(
  uri: string,
  reportedSize: number | null | undefined
) {
  if (Number.isFinite(reportedSize) && (reportedSize ?? 0) > 0) {
    return reportedSize as number;
  }

  try {
    const fileSystem = await import('expo-file-system/legacy');
    const info = await fileSystem.getInfoAsync(uri);

    if (info.exists && Number.isFinite(info.size) && info.size > 0) {
      return info.size;
    }
  } catch {
    // file system info unavailable; fall through to return 0
  }

  return 0;
}

export function useImportBackup() {
  const [selectedFile, setSelectedFile] = useState<SelectedBackupFile | null>(
    null
  );
  const [activeBatchId, setActiveBatchId] =
    useState<Id<'importBatches'> | null>(null);
  const [importStatus, setImportStatus] = useState<LocalImportStatus | null>(
    null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startImportMutation = useMutation(convexJournalService.startImport);

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
      size: await resolveNativeFileSize(asset.uri, asset.size),
      uri: asset.uri,
      mimeType: asset.mimeType ?? null,
      webFile: null,
    });
  }, []);

  const startBackupImport = useCallback(
    async (workerBaseUrl: string | null, userId: Id<'users'> | null) => {
      setError(null);

      // Offline guard: the backup import is a worker upload plus a Convex
      // mutation, so it cannot complete while the device is known to be
      // offline. Surface a clear message through the existing error state
      // instead of letting the raw platform network error surface.
      if (isConnectivityOffline()) {
        setError('You appear to be offline. Reconnect to import this backup.');
        return;
      }

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

        // Local-first: track the import job from local state. A started
        // import is in the first state of the transition rules, `queued`.
        setImportStatus({
          batchId: startResult.batchId,
          status: 'queued',
          sourceFileName: selectedFile.name,
          fileSize,
          importedAt: Date.now(),
          completedAt: null,
          errorMessage: null,
          counts: { ...EMPTY_IMPORT_COUNTS },
        });
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
    importStatus,
    isUploading,
    error,
  };
}
