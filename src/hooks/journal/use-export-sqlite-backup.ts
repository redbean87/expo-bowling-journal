/**
 * C-4 T4 — the export hook: local journal -> one device-specific PinPal `.db`.
 *
 * The pipeline this hook now owns is the PinPal interchange half of the §4
 * adapter pipeline, not the canonical-document half:
 *
 * ```text
 * local SQLite journal -> canonical snapshot -> legacy rows
 *                      -> device dialect writer -> one .db file
 * ```
 *
 * The snapshot comes from `@/services/local-journal/journal-backup-format`
 * (`readJournalBackupData`, one query per table over the local journal — no
 * Convex, no network, no worker), the rows from the shared converter
 * (`@/services/local-journal/pinpal-backup-rows`, C-4 T1), and the container
 * from the dialect writer that matches the device this export runs on: the
 * raw Android image (`./export-backup/android-pinpal-dialect`, C-4 T2) or the
 * iOS plist-wrapped compound image (`./export-backup/ios-pinpal-dialect`,
 * C-4 T3). Exactly one file is produced per export, and its bytes are the
 * SQLite image, so the extension is `.db` — the extension of what the file
 * actually is.
 *
 * ## What this replaced (audit A1, A2, A14, A15)
 *
 * The hook used to hand the version-1 `.json` envelope to the platform, which
 * PinPal cannot read. That envelope is no longer the shipped artifact: the
 * JSON contract in `@/services/local-journal/journal-backup-format` survives
 * as the *canonical snapshot* the converter consumes, and as the format the
 * importer still recognizes so existing `.json` backups stay importable
 * (`src/hooks/journal/import-backup/file-validation.ts` sniffs bytes, not
 * names, and already reads the raw SQLite and iOS compound forms too).
 *
 * ## Why the dialect is chosen here
 *
 * PinPal's two backup dialects are device-specific and are not
 * interchangeable, so the device decides: Android writes the Android image,
 * iOS writes the iOS image. Web and PWA have no device dialect to read off,
 * so the user picks — an explicit Android-versus-iOS prompt, the same
 * `globalThis.confirm` idiom the delete dialogs already use on web — and one
 * file for that chosen dialect is produced. A caller that already knows the
 * dialect (a future settings screen) can pass it; on a device the device
 * always wins.
 *
 * The bytes travel to the platform through the unchanged delivery boundary
 * (`./export-backup/native-export-file`: cache-directory write plus share
 * sheet, and the browser download below), which base64-encodes the blob it is
 * handed — so the image bytes are written verbatim, never re-encoded as JSON
 * text.
 *
 * Snapshot consistency is stated, not assumed (A17): the tables are read one
 * query per table with no cross-table freeze, so the converter validates the
 * relationships rather than trusting a frozen database.
 */
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { buildAndroidPinpalBackupImage } from './export-backup/android-pinpal-dialect';
import { sanitizeBackupFileName } from './export-backup/export-filename';
import { buildIosPinpalBackupImage } from './export-backup/ios-pinpal-dialect';
import { saveAndShareNativeBackupFile } from './export-backup/native-export-file';

import { getLocalJournalService } from '@/services/local-journal';
import { readJournalBackupData } from '@/services/local-journal/journal-backup-format';
import { buildPinPalLegacyRows } from '@/services/local-journal/pinpal-backup-rows';

/** The extension of the one artifact this hook delivers. */
const PINPAL_BACKUP_FILE_EXTENSION = '.db';

/** The media type of the artifact: raw SQLite bytes, never JSON text. */
const PINPAL_BACKUP_MIME_TYPE = 'application/octet-stream';

/** The two PinPal backup dialects, each tied to the device that runs it. */
type PinpalExportDialect = 'android' | 'ios';

/**
 * The dialect the device this export runs on writes, or `null` when the
 * platform carries no device dialect to read off (web, PWA).
 */
function deviceExportDialect(): PinpalExportDialect | null {
  if (Platform.OS === 'android') {
    return 'android';
  }

  if (Platform.OS === 'ios') {
    return 'ios';
  }

  return null;
}

/**
 * The dialect to write when the platform cannot decide it.
 *
 * Web has no PinPal device to infer a dialect from, so the choice is asked
 * for, in the same `globalThis.confirm` style the web delete dialogs already
 * use. The answer is echoed back to the caller as `lastExportDialect` so the
 * screen can say which dialect the delivered file carries.
 */
function askWebExportDialect(): PinpalExportDialect {
  const isAndroidChosen = globalThis.confirm(
    'Export the Android PinPal dialect? OK = Android, Cancel = iOS.'
  );

  return isAndroidChosen ? 'android' : 'ios';
}

function getDefaultExportFileName() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateLabel = `${year}-${month}-${day}`;

  return `bowling-journal-${dateLabel}${PINPAL_BACKUP_FILE_EXTENSION}`;
}

export function useExportSqliteBackup() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportFileName, setLastExportFileName] = useState<string | null>(
    null
  );
  const [lastExportDialect, setLastExportDialect] =
    useState<PinpalExportDialect | null>(null);

  const exportSqliteBackup = useCallback(
    async (requestedDialect?: PinpalExportDialect) => {
      setExportError(null);
      setIsExporting(true);

      try {
        const dialect: PinpalExportDialect =
          deviceExportDialect() ?? requestedDialect ?? askWebExportDialect();

        const journalData = await readJournalBackupData(
          getLocalJournalService()
        );
        const legacyRows = buildPinPalLegacyRows(
          journalData,
          new Date().getTimezoneOffset()
        );
        const backupImage =
          dialect === 'android'
            ? await buildAndroidPinpalBackupImage(legacyRows)
            : await buildIosPinpalBackupImage(legacyRows);
        // The blob owns a copy of the image, so the bytes the platform writes
        // are exactly the bytes the writer returned.
        const backupBlob = new Blob([new Uint8Array(backupImage)], {
          type: PINPAL_BACKUP_MIME_TYPE,
        });

        const defaultFileName = getDefaultExportFileName();
        const fileName = sanitizeBackupFileName(
          defaultFileName,
          defaultFileName
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
        setLastExportDialect(dialect);
      } catch (caught) {
        setExportError(
          caught instanceof Error ? caught.message : 'Journal export failed.'
        );
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  return {
    exportSqliteBackup,
    isExporting,
    exportError,
    lastExportFileName,
    lastExportDialect,
  };
}
