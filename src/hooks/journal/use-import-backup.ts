import { useMutation } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { pickBackupFileOnWeb } from './import-backup/file-picker-web';
import { detectBackupFormat } from './import-backup/file-validation';
import {
  type SelectedBackupFile,
  uploadBackupFileAndStartImport,
} from './import-backup/import-upload-client';

import type { Id } from '../../../convex/_generated/dataModel';
import type {
  PinpalImportResult,
  PinpalSkippedRows,
} from '@/services/local-journal/pinpal-backup-import';

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
  /**
   * The server batch this job belongs to, or `null` for an import that never
   * reached a server — a local restore has no batch to poll and no status to
   * advance from the server side.
   */
  batchId: Id<'importBatches'> | null;
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

/** The radix-64 alphabet `expo-file-system/legacy` reads a file with. */
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** The six-bit value of one base64 digit, or -1 when it is not a digit. */
function base64DigitValue(digit: string): number {
  return BASE64_ALPHABET.indexOf(digit);
}

/**
 * A file's base64 payload, back to the bytes it carries.
 *
 * `expo-file-system/legacy` hands binary files to the app as base64 text
 * (the same seam `@/hooks/journal/use-export-sqlite-backup` writes binary
 * through), so the picked backup's bytes have to be decoded before the
 * importer can open them. Padding and any other non-alphabet character is
 * skipped, so the decoded length is exactly the digits' bit width.
 */
function decodeBase64ToBytes(encoded: string): Uint8Array<ArrayBuffer> {
  let digits = 0;

  for (const character of encoded) {
    if (base64DigitValue(character) >= 0) {
      digits += 1;
    }
  }

  const bytes = new Uint8Array(Math.floor((digits * 6) / 8));
  let bitBuffer = 0;
  let bitCount = 0;
  let written = 0;

  for (const character of encoded) {
    const value = base64DigitValue(character);

    if (value < 0) {
      continue;
    }

    bitBuffer = (bitBuffer << 6) | value;
    bitCount += 6;

    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[written] = (bitBuffer >> bitCount) & 0xff;
      written += 1;
    }
  }

  return bytes;
}

/**
 * The picked file's bytes, read on the device.
 *
 * A web pick already holds the file in memory (`webFile`), and a native pick
 * is read from its own URI through `expo-file-system/legacy` — the picker
 * copies the asset into the cache directory, so the URI it reports is a
 * local file. Nothing here reaches a server: the bytes are read so the
 * import flow can decide what the file is before it decides where to send
 * it. `null` means the file could not be read at all, which leaves the
 * existing upload path to report the failure the way it always has.
 */
async function readSelectedBackupBytes(
  selectedFile: SelectedBackupFile | null
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (selectedFile === null) {
    return null;
  }

  if (selectedFile.webFile) {
    return new Uint8Array(await selectedFile.webFile.arrayBuffer());
  }

  if (!selectedFile.uri) {
    return null;
  }

  try {
    const fileSystem = await import('expo-file-system/legacy');
    const encoded = await fileSystem.readAsStringAsync(selectedFile.uri, {
      encoding: 'base64',
    });

    return decodeBase64ToBytes(encoded);
  } catch {
    return null;
  }
}

/** One skipped-row counter, summed: how many rows the journal could not place. */
function countSkippedRows(skipped: PinpalSkippedRows): number {
  return (
    skipped.houses +
    skipped.patterns +
    skipped.balls +
    skipped.leagues +
    skipped.weeks +
    skipped.games +
    skipped.frames
  );
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
  const [localImportReport, setLocalImportReport] =
    useState<PinpalImportResult | null>(null);

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

      if (!selectedFile) {
        setError('Pick a backup file first.');
        return;
      }

      // The seam: a PinPal backup is restored on the device, so the file's
      // bytes are read before any of the server requirements are considered.
      // Detection is the existing byte sniffing in `./import-backup/file-
      // validation` (never the file name), so the same file decides the same
      // way here and in the upload path. The sniff reads the bytes as they are:
      // React Native's `Blob` refuses `ArrayBuffer` and `ArrayBufferView`
      // parts, so wrapping them is what fails on a device.
      const backupBytes = await readSelectedBackupBytes(selectedFile);
      const backupFormat =
        backupBytes === null ? null : await detectBackupFormat(backupBytes);

      if (
        backupBytes !== null &&
        (backupFormat === 'pinpal-sqlite' ||
          backupFormat === 'pinpal-lite-compound')
      ) {
        // Offline import: the local importer reads the file's rows and writes
        // them through the local journal service, so a worker URL, a signed-
        // in user and a live connection are none of it. The importer's own
        // restored counts and skipped rows are reported, so a partial import
        // is visible rather than silent.
        try {
          // Loaded here rather than at the top of the module: the local
          // restore reaches `expo-sqlite`, which only exists on a device,
          // so the cloud path — and the suites that exercise only the cloud
          // path — keep loading without it.
          const localJournal = await import('../../services/local-journal');
          const pinpalImporter =
            await import('../../services/local-journal/pinpal-backup-import');

          const importedAt = Date.now();
          const imported = await pinpalImporter.importPinPalBackupIntoJournal(
            backupBytes,
            localJournal.getLocalJournalService(),
            new Date().getTimezoneOffset()
          );

          setLocalImportReport(imported);
          setImportStatus({
            batchId: null,
            status: 'completed',
            sourceFileName: selectedFile.name,
            fileSize: selectedFile.size ?? 0,
            importedAt,
            completedAt: Date.now(),
            errorMessage: null,
            counts: {
              houses: imported.restored.houses,
              patterns: imported.restored.patterns,
              balls: imported.restored.balls,
              leagues: imported.restored.leagues,
              // The legacy `week` rows are what this import turns into
              // sessions, so both counters name the same restored entities.
              weeks: imported.restored.sessions,
              sessions: imported.restored.sessions,
              games: imported.restored.games,
              frames: imported.restored.frames,
              gamesRefined: 0,
              gamesPatched: 0,
              warnings: countSkippedRows(imported.skipped),
            },
          });
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Local import failed. Try the backup file this app exported.'
          );
        }

        return;
      }

      // Everything else keeps the existing cloud path: this app's own `.json`
      // envelope and any file the sniffer does not recognise are imported by
      // the worker pipeline, which writes into the Convex journal and needs
      // the worker URL, the signed-in user and a live connection.
      if (isConnectivityOffline()) {
        setError('You appear to be offline. Reconnect to import this backup.');
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
    localImportReport,
    selectedFileLabel,
    activeBatchId,
    importStatus,
    isUploading,
    error,
  };
}
