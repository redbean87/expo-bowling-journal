import { useConvex, useConvexAuth } from 'convex/react';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import type { SqliteBackupSnapshot } from '@/services/journal';

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

      if (Platform.OS !== 'web') {
        setExportError('SQLite export is currently available on web only.');
        return;
      }

      setIsExporting(true);

      try {
        const snapshotBase = await convex.query(
          convexJournalService.getSqliteBackupSnapshotBase,
          {}
        );
        const frames: SqliteBackupSnapshot['frames'] = [];
        const chunkSize = 1000;

        for (
          let offset = 0;
          offset < snapshotBase.totalFrames;
          offset += chunkSize
        ) {
          const chunk = await convex.query(
            convexJournalService.getSqliteBackupFramesChunk,
            {
              offset,
              limit: chunkSize,
            }
          );
          frames.push(...chunk.frames);
        }

        const { totalFrames: _, ...snapshotWithoutFrames } = snapshotBase;
        const snapshot: SqliteBackupSnapshot = {
          ...snapshotWithoutFrames,
          frames,
        };
        const fileName = getDefaultExportFileName();
        const normalizedBaseUrl = workerBaseUrl.replace(/\/+$/, '');
        const exportResponse = await fetch(
          `${normalizedBaseUrl}/exports/sqlite`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              fileName,
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
