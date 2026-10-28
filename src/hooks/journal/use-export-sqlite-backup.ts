/**
 * C-4 G3 — the export hook: local SQLite -> versioned JSON artifact -> file.
 *
 * The hook is the consumer half of the §4 adapter pipeline. The producer half
 * (`src/services/local-journal/journal-backup-format.ts`, C-4 G1/G2) reads the
 * canonical model out of the local SQLite journal and emits the version-1
 * envelope; this hook asks that serializer for the document and hands the
 * resulting bytes to the platform delivery boundary
 * (`./export-backup/native-export-file`, which owns the native cache-directory
 * write plus the share sheet, and the browser download below, which owns web/
 * PWA).
 *
 * What this replaced (audit A1, A2, A14, A18): the hook used to query the
 * Convex cloud journal (`convex.query(getSqliteBackupSnapshot)`) and POST the
 * snapshot to the worker's `/exports/sqlite` endpoint, and it refused to run
 * unless `useConvexAuth()` reported a session and a worker base URL was
 * configured. In local mode that produced either no file at all, or a file
 * holding the *cloud* journal of a sign-in-era user rather than what the app
 * shows. There is now no Convex, authentication, network, or worker reference
 * anywhere on the export path: the data source is `getLocalJournalService()`,
 * and the artifact is the serializer's `.json` document.
 *
 * The worker service and the import pipeline are deliberately untouched here
 * (A14: the worker is shared with the Convex cloud import scheduler, so it
 * cannot be disabled from the export side).
 *
 * Snapshot consistency is stated, not assumed — see the serializer's own
 * note (A17): the tables are read one query per table with no cross-table
 * freeze, so a reader must validate relationships rather than assume a frozen
 * database.
 */
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { sanitizeBackupFileName } from './export-backup/export-filename';
import { saveAndShareNativeBackupFile } from './export-backup/native-export-file';

import { getLocalJournalService } from '@/services/local-journal';
import {
  JOURNAL_BACKUP_FILE_EXTENSION,
  buildJournalBackupDocument,
  serializeJournalBackupJson,
} from '@/services/local-journal/journal-backup-format';

/** The media type of the artifact this hook writes or downloads. */
const JOURNAL_BACKUP_MIME_TYPE = 'application/json';

function getDefaultExportFileName() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateLabel = `${year}-${month}-${day}`;

  return `bowling-journal-${dateLabel}${JOURNAL_BACKUP_FILE_EXTENSION}`;
}

export function useExportSqliteBackup() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportFileName, setLastExportFileName] = useState<string | null>(
    null
  );

  const exportSqliteBackup = useCallback(async () => {
    setExportError(null);
    setIsExporting(true);

    try {
      const backupDocument = await buildJournalBackupDocument(
        getLocalJournalService(),
        new Date().toISOString()
      );
      const backupBlob = new Blob(
        [serializeJournalBackupJson(backupDocument)],
        { type: JOURNAL_BACKUP_MIME_TYPE }
      );
      const defaultFileName = getDefaultExportFileName();
      const fileName = sanitizeBackupFileName(defaultFileName, defaultFileName);

      if (Platform.OS === 'web') {
        const objectUrl = URL.createObjectURL(backupBlob);

        try {
          const anchor = document.createElement('a');

          anchor.href = objectUrl;
          anchor.download = fileName;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      } else {
        await saveAndShareNativeBackupFile(backupBlob, fileName);
      }

      setLastExportFileName(fileName);
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : 'Journal export failed.'
      );
    } finally {
      setIsExporting(false);
    }
  }, []);

  return {
    exportSqliteBackup,
    isExporting,
    exportError,
    lastExportFileName,
  };
}
