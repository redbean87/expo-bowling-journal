import { JOURNAL_BACKUP_FILE_EXTENSION } from '../../../services/local-journal/journal-backup-format';

const WINDOWS_RESERVED_FILE_CHARS = /[<>:"/\\|?*]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Extensions a backup file name may already carry.
 *
 * `.json` is this app's own journal document (`JOURNAL_BACKUP_FILE_EXTENSION`);
 * the rest are the legacy PinPal and worker-produced images, which keep their
 * own names on the compatibility path.
 */
const KNOWN_BACKUP_EXTENSIONS = [
  JOURNAL_BACKUP_FILE_EXTENSION,
  '.pinpal',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.backup',
];

function backupFileExtension(fileName: string): string | null {
  const lowered = fileName.toLowerCase();

  for (const extension of KNOWN_BACKUP_EXTENSIONS) {
    if (lowered.endsWith(extension)) {
      return extension;
    }
  }

  return null;
}

export function parseDownloadFileName(contentDispositionHeader: string | null) {
  if (!contentDispositionHeader) {
    return null;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDispositionHeader);

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(contentDispositionHeader);

  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const bareMatch = /filename=([^;]+)/i.exec(contentDispositionHeader);

  return bareMatch?.[1]?.trim() ?? null;
}

/**
 * The name a backup file is written under.
 *
 * A name that already carries a known backup extension keeps it, so a legacy
 * PinPal or worker `.db` image keeps its `.db` and a journal document keeps its
 * `.json`. A name without one takes the extension of the `fallback` the caller
 * supplies — the caller owns the format, so a journal export passes a
 * `bowling-journal-YYYY-MM-DD.json` fallback — and otherwise appends
 * {@link JOURNAL_BACKUP_FILE_EXTENSION}, the approved journal extension, never
 * the legacy `.db`.
 */
export function sanitizeBackupFileName(
  candidate: string | null | undefined,
  fallback: string
) {
  const normalized = (candidate ?? '').trim();

  if (!normalized) {
    return fallback;
  }

  const withoutReserved = normalized
    .replace(WINDOWS_RESERVED_FILE_CHARS, '-')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!withoutReserved) {
    return fallback;
  }

  const extension = backupFileExtension(withoutReserved);

  if (extension) {
    return withoutReserved;
  }

  return `${withoutReserved}${
    backupFileExtension(fallback) ?? JOURNAL_BACKUP_FILE_EXTENSION
  }`;
}
