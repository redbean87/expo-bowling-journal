import { useConvex, useConvexAuth } from 'convex/react';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import {
  parseDownloadFileName,
  sanitizeBackupFileName,
} from './export-backup/export-filename';
import { saveAndShareNativeBackupFile } from './export-backup/native-export-file';

import { convexJournalService } from '@/services/journal';

function getDefaultExportFileName() {
  const dateLabel = new Date().toISOString().slice(0, 10);
  return `bowling-journal-${dateLabel}.db`;
}

export function useExportSqliteBackup() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportFileName, setLastExportFileName] = useState<string | null>(
    null
  );

  const exportSqliteBackup = useCallback(
    async (workerBaseUrl: string | null) => {
      setExportError(null);

      if (!isAuthenticated) {
        setExportError('Sign in before exporting a backup.');
        return;
      }

      if (!workerBaseUrl) {
        setExportError(
          'Import worker URL is missing. Set EXPO_PUBLIC_IMPORT_WORKER_URL.'
        );
        return;
      }

      setIsExporting(true);

      try {
        const snapshot = await convex.query(
          convexJournalService.getSqliteBackupSnapshot,
          {}
        );
        const defaultFileName = getDefaultExportFileName();
        const requestedFileName = sanitizeBackupFileName(
          defaultFileName,
          defaultFileName
        );
        const normalizedBaseUrl = workerBaseUrl.replace(/\/+$/, '');
        const exportResponse = await fetch(
          `${normalizedBaseUrl}/exports/sqlite`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              fileName: requestedFileName,
              snapshot,
            }),
          }
        );

        if (!exportResponse.ok) {
          const responseText = await exportResponse.text();
          throw new Error(
            responseText || 'Failed to generate SQLite backup file.'
          );
        }

        const backupBlob = await exportResponse.blob();
        const downloadFileName = parseDownloadFileName(
          exportResponse.headers.get('content-disposition')
        );
        const fileName = sanitizeBackupFileName(
          downloadFileName,
          requestedFileName
        );

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
          caught instanceof Error ? caught.message : 'SQLite export failed.'
        );
      } finally {
        setIsExporting(false);
      }
    },
    [convex, isAuthenticated]
  );

  return {
    exportSqliteBackup,
    isExporting,
    exportError,
    lastExportFileName,
  };
}
