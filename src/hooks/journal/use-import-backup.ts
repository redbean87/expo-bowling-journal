import { useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import type { Id } from '../../../convex/_generated/dataModel';

import { convexJournalService } from '@/services/journal';

type UploadUrlResponse = {
  r2Key: string;
  uploadUrl: string;
  expiresAt: string;
};

type SelectedBackupFile = {
  name: string;
  size: number;
  uri: string | null;
  mimeType: string | null;
  webFile: File | null;
};

const WEB_BACKUP_ACCEPT =
  '.pinpal,.db,.sqlite,.sqlite3,.backup,application/x-sqlite3,application/vnd.sqlite3,application/octet-stream';
const SQLITE_HEADER = 'SQLite format 3\u0000';

type FilePickerFileHandleLike = {
  getFile: () => Promise<File>;
};

type ShowOpenFilePickerLike = (options?: {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<FilePickerFileHandleLike[]>;

async function isSupportedBackupBlob(fileBlob: Blob) {
  if (fileBlob.size <= 0) {
    return false;
  }

  const headerBuffer = await fileBlob
    .slice(0, SQLITE_HEADER.length)
    .arrayBuffer();
  const headerText = new TextDecoder().decode(headerBuffer);

  return headerText === SQLITE_HEADER;
}

function isAbortError(caught: unknown) {
  if (!caught || typeof caught !== 'object') {
    return false;
  }

  return 'name' in caught && caught.name === 'AbortError';
}

async function pickBackupFileOnWeb(): Promise<File | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  const openFilePicker = (
    window as Window & { showOpenFilePicker?: ShowOpenFilePickerLike }
  ).showOpenFilePicker;

  if (openFilePicker) {
    try {
      const handles = await openFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'PinPal backup files',
            accept: {
              'application/octet-stream': [
                '.pinpal',
                '.db',
                '.sqlite',
                '.sqlite3',
                '.backup',
              ],
              'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'],
              'application/vnd.sqlite3': ['.db', '.sqlite', '.sqlite3'],
            },
          },
        ],
      });

      const fileHandle = handles[0];

      if (!fileHandle) {
        return null;
      }

      return fileHandle.getFile();
    } catch (caught) {
      if (isAbortError(caught)) {
        return null;
      }
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = WEB_BACKUP_ACCEPT;
    input.multiple = false;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    const finalize = (file: File | null) => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      input.remove();
      resolve(file);
    };

    const onChange = () => {
      finalize(input.files?.[0] ?? null);
    };

    const onCancel = () => {
      finalize(null);
    };

    input.addEventListener('change', onChange, { once: true });
    input.addEventListener('cancel', onCancel, { once: true });
    input.click();
  });
}

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

        let fileBlob: Blob;

        if (selectedFile.webFile) {
          fileBlob = selectedFile.webFile;
        } else {
          if (!selectedFile.uri) {
            throw new Error('Selected file is missing a readable URI.');
          }

          const localFileResponse = await fetch(selectedFile.uri);

          if (!localFileResponse.ok) {
            throw new Error('Could not read selected backup file.');
          }

          fileBlob = await localFileResponse.blob();
        }

        const isSupportedBackup = await isSupportedBackupBlob(fileBlob);

        if (!isSupportedBackup) {
          throw new Error(
            'Selected file is not a supported PinPal SQLite backup.'
          );
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

        const startResult = await startImportMutation({
          r2Key: uploadPayload.r2Key,
          fileName: selectedFile.name,
          fileSize,
          checksum: null,
          idempotencyKey: createIdempotencyKey(),
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
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
