import {
  JOURNAL_BACKUP_FORMAT,
  JOURNAL_BACKUP_VERSION,
} from '../../../services/local-journal/journal-backup-format';

const SQLITE_HEADER = 'SQLite format 3\u0000';

// PinPal Lite iOS uses compound format: XML plist + padding + SQLite at offset 4096
const PINPAL_LITE_SQLITE_OFFSET = 4096;

/**
 * The backup formats this app can read, in the order they are sniffed.
 *
 * Detection is content-based: the bytes of the file decide the format, and a
 * file name (or its extension) is never taken as proof of what the file
 * contains. A `.json` file that holds a SQLite image is a SQLite image, and a
 * `.pinpal` file that holds this app's JSON envelope is this app's envelope.
 *
 * - `journal-json` — this app's own versioned JSON backup document
 *   (`src/services/local-journal/journal-backup-format.ts`), written with the
 *   `.json` extension.
 * - `pinpal-sqlite` — a raw SQLite image: the legacy PinPal backup, and the
 *   legacy `.db` image the worker used to produce.
 * - `pinpal-lite-compound` — PinPal Lite iOS compound file: XML plist, padding,
 *   then a SQLite image at offset 4096.
 * - `null` — not a backup this app can read.
 */
export type DetectedImportFormat =
  | 'journal-json'
  | 'pinpal-sqlite'
  | 'pinpal-lite-compound'
  | null;

/**
 * The outcome of validating a selected backup file.
 *
 * `format` is the supported format, or `null` when the file cannot be read.
 * `errors` carries one actionable, user-facing message per reason the file was
 * rejected — an unsupported format tag, an unsupported envelope version,
 * malformed JSON, or a file that is not a backup at all — and is empty when
 * `format` is not `null`.
 */
export interface BackupFileValidation {
  errors: string[];
  format: DetectedImportFormat;
}

type BlobWithArrayBuffer = Blob & {
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

async function readBlobSliceArrayBuffer(
  fileBlob: Blob,
  length: number,
  offset: number = 0
): Promise<ArrayBuffer> {
  const blobSlice = fileBlob.slice(
    offset,
    offset + length
  ) as BlobWithArrayBuffer;

  if (typeof blobSlice.arrayBuffer === 'function') {
    return blobSlice.arrayBuffer();
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onerror = () => {
      reject(new Error('Could not read backup file header.'));
    };

    fileReader.onloadend = () => {
      if (fileReader.result instanceof ArrayBuffer) {
        resolve(fileReader.result);
        return;
      }

      reject(new Error('Could not read backup file header.'));
    };

    fileReader.readAsArrayBuffer(blobSlice);
  });
}

function decodeBytesText(bytes: Uint8Array<ArrayBufferLike>): string {
  return new TextDecoder().decode(bytes);
}

async function readBlobText(fileBlob: Blob): Promise<string> {
  return decodeBytesText(
    new Uint8Array(await readBlobSliceArrayBuffer(fileBlob, fileBlob.size))
  );
}

/**
 * Where a selected backup file's bytes come from, and how they are read.
 *
 * A native pick is read into bytes (`expo-file-system/legacy` hands a binary
 * file over as base64), and the web picker and the upload path hold a picked
 * `Blob`/`File`. React Native's `Blob` cannot be built from an `ArrayBuffer`
 * or a typed array, so the device path passes its bytes through rather than
 * wrapping them; both shapes are read the same two ways — a slice at an
 * offset, and the whole file as text — so the sniff decides identically.
 */
interface BackupByteSource {
  name: string | null;
  type: string | null;
  size: number;
  readSlice(
    offset: number,
    length: number
  ): Promise<Uint8Array<ArrayBufferLike>>;
  readAllText(): Promise<string>;
}

function bytesSource(bytes: Uint8Array<ArrayBufferLike>): BackupByteSource {
  return {
    name: null,
    type: null,
    size: bytes.length,
    async readSlice(offset, length) {
      const start = Math.min(offset, bytes.length);

      return bytes.subarray(start, Math.min(start + length, bytes.length));
    },
    async readAllText() {
      return decodeBytesText(bytes);
    },
  };
}

function blobSource(fileBlob: Blob): BackupByteSource {
  return {
    name: (fileBlob as File).name ?? null,
    type: (fileBlob as File).type ?? null,
    size: fileBlob.size,
    async readSlice(offset, length) {
      return new Uint8Array(
        await readBlobSliceArrayBuffer(fileBlob, length, offset)
      );
    },
    readAllText() {
      return readBlobText(fileBlob);
    },
  };
}

/**
 * True when the first non-whitespace byte opens a JSON object.
 *
 * Only the header slice is inspected, so a SQLite image (which opens with the
 * `SQLite format 3` magic) and a PinPal Lite compound file (which opens with an
 * XML plist declaration) are never parsed as JSON.
 */
function looksLikeJsonObject(bytes: Uint8Array<ArrayBufferLike>): boolean {
  for (const character of decodeBytesText(bytes)) {
    if (
      character === ' ' ||
      character === '\t' ||
      character === '\n' ||
      character === '\r' ||
      character === '\uFEFF'
    ) {
      continue;
    }

    return character === '{';
  }

  return false;
}

function describeBackupValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

/**
 * Validate this app's own JSON envelope before anything is imported.
 *
 * The envelope is self-describing, so the reader checks the header fields —
 * `format`, `version`, `exportedAt`, `data` — and stops with a specific
 * message when they are missing or name something this app does not write.
 * Payload validation (tables, ids, relationships, dates) belongs to the local
 * restore path, which is the one that applies the payload.
 *
 * @returns `journal-json` with no errors, or `null` with the reason.
 */
async function validateJournalEnvelope(
  documentText: string
): Promise<BackupFileValidation> {
  let document: unknown;

  try {
    document = JSON.parse(documentText);
  } catch (parseError) {
    const parseMessage =
      parseError instanceof Error ? parseError.message : String(parseError);

    console.log(
      '[Import Debug] JSON document could not be parsed:',
      parseMessage
    );

    return {
      errors: [
        `The selected file opens like JSON but is not readable: ${parseMessage}. Choose the backup file this app exported.`,
      ],
      format: null,
    };
  }

  if (
    document === null ||
    typeof document !== 'object' ||
    Array.isArray(document)
  ) {
    return {
      errors: [
        'The selected JSON file is not a bowling journal backup document: its top level is not an object.',
      ],
      format: null,
    };
  }

  const envelope = document as Record<string, unknown>;

  console.log('[Import Debug] JSON envelope header:', {
    format: envelope.format ?? 'missing',
    version: envelope.version ?? 'missing',
  });

  if (!('format' in envelope)) {
    return {
      errors: [
        'The selected JSON file has no "format" field, so this app cannot tell which backup format it is. Choose the backup file this app exported.',
      ],
      format: null,
    };
  }

  if (envelope.format !== JOURNAL_BACKUP_FORMAT) {
    return {
      errors: [
        `The selected file declares the format ${describeBackupValue(envelope.format)}, which is not the bowling journal backup format "${JOURNAL_BACKUP_FORMAT}". A PinPal backup is selected as its own file, not as a .json document.`,
      ],
      format: null,
    };
  }

  if (!('version' in envelope)) {
    return {
      errors: [
        `The selected bowling journal file has no "version", so this app cannot tell which backup layout it holds. This app writes version ${JOURNAL_BACKUP_VERSION}.`,
      ],
      format: null,
    };
  }

  if (envelope.version !== JOURNAL_BACKUP_VERSION) {
    return {
      errors: [
        `The selected bowling journal backup uses version ${describeBackupValue(envelope.version)}; this app reads version ${JOURNAL_BACKUP_VERSION}.`,
      ],
      format: null,
    };
  }

  if (
    !('exportedAt' in envelope) ||
    typeof envelope.exportedAt !== 'string' ||
    envelope.exportedAt.length === 0
  ) {
    return {
      errors: [
        'The selected bowling journal backup has no "exportedAt" export timestamp, so it was not written by this app.',
      ],
      format: null,
    };
  }

  if (
    !('data' in envelope) ||
    envelope.data === null ||
    typeof envelope.data !== 'object' ||
    Array.isArray(envelope.data)
  ) {
    return {
      errors: [
        'The selected bowling journal backup has no "data" payload, so there is nothing to import.',
      ],
      format: null,
    };
  }

  console.log('[Import Debug] Detected: journal-json');

  return { errors: [], format: 'journal-json' };
}

/**
 * Decide what a selected backup file is, and say why when it is not one.
 *
 * Reads the file's bytes in a fixed order — SQLite magic at offset 0, then the
 * PinPal Lite compound magic at offset 4096, then a JSON envelope — so the
 * legacy PinPal formats are identified before the JSON path is considered and
 * can never be mistaken for this app's `.json` document. `validateBackupBlob`
 * and `validateBackupBytes` are the two entry points, one per shape a caller
 * holds.
 */
async function classifyBackupSource(
  source: BackupByteSource
): Promise<BackupFileValidation> {
  console.log('[Import Debug] File validation started:', {
    fileName: source.name ?? 'unknown',
    fileSize: source.size,
    fileType: source.type ?? 'unknown',
  });

  if (source.size <= 0) {
    console.log('[Import Debug] File size is 0 or negative');

    return {
      errors: [
        'The selected file is empty. Choose the backup file you exported.',
      ],
      format: null,
    };
  }

  if (source.size < SQLITE_HEADER.length) {
    console.log(
      '[Import Debug] File too small:',
      source.size,
      'bytes (need at least',
      SQLITE_HEADER.length,
      ')'
    );

    return {
      errors: [
        'The selected file is too small to be a backup file. Choose the backup file you exported.',
      ],
      format: null,
    };
  }

  const headerBytes = await source.readSlice(0, SQLITE_HEADER.length);
  const headerText = decodeBytesText(headerBytes);

  const headerHex = Array.from(headerBytes.slice(0, 16))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');

  console.log('[Import Debug] Header at offset 0:', {
    text: headerText.slice(0, 16),
    hex: headerHex,
    matches: headerText === SQLITE_HEADER,
  });

  if (headerText === SQLITE_HEADER) {
    console.log('[Import Debug] Detected: standard-sqlite');

    return { errors: [], format: 'pinpal-sqlite' };
  }

  if (source.size >= PINPAL_LITE_SQLITE_OFFSET + SQLITE_HEADER.length) {
    try {
      const offsetBytes = await source.readSlice(
        PINPAL_LITE_SQLITE_OFFSET,
        SQLITE_HEADER.length
      );
      const offsetHeader = decodeBytesText(offsetBytes);

      const offsetHex = Array.from(offsetBytes.slice(0, 16))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ');

      console.log('[Import Debug] Header at offset 4096:', {
        text: offsetHeader.slice(0, 16),
        hex: offsetHex,
        matches: offsetHeader === SQLITE_HEADER,
      });

      if (offsetHeader === SQLITE_HEADER) {
        console.log('[Import Debug] Detected: compound-sqlite');

        return { errors: [], format: 'pinpal-lite-compound' };
      }
    } catch (offsetError) {
      console.log('[Import Debug] Error reading offset 4096:', offsetError);
    }
  } else {
    console.log(
      '[Import Debug] File too small for compound format check:',
      source.size,
      'bytes (need at least',
      PINPAL_LITE_SQLITE_OFFSET + SQLITE_HEADER.length,
      ')'
    );
  }

  if (looksLikeJsonObject(headerBytes)) {
    return await validateJournalEnvelope(await source.readAllText());
  }

  console.log(
    '[Import Debug] Detection failed: not a supported journal or PinPal backup'
  );

  return {
    errors: [
      'The selected file is not a backup this app can read: it is neither a bowling journal .json document nor a PinPal SQLite database backup.',
    ],
    format: null,
  };
}

/**
 * Validate a picked `Blob` or `File` — the shape the upload path holds.
 */
export async function validateBackupBlob(
  fileBlob: Blob
): Promise<BackupFileValidation> {
  return await classifyBackupSource(blobSource(fileBlob));
}

/**
 * Validate the bytes of a picked file — the shape the device path holds.
 *
 * `expo-file-system/legacy` hands a native pick's file over as bytes, and
 * React Native's `Blob` refuses to be built from them, so the sniff reads the
 * bytes directly. The decision is the one `validateBackupBlob` makes.
 */
export async function validateBackupBytes(
  bytes: Uint8Array<ArrayBufferLike>
): Promise<BackupFileValidation> {
  return await classifyBackupSource(bytesSource(bytes));
}

/**
 * The format a picked file is, from its bytes alone — never its name.
 *
 * Accepts either shape a caller has: the bytes a native pick was read into
 * (`Uint8Array`, which is what a device holds), or the `Blob`/`File` the web
 * picker and the upload path hold. Both decide identically.
 */
export async function detectBackupFormat(
  source: Blob | Uint8Array<ArrayBufferLike>
): Promise<DetectedImportFormat> {
  const validation =
    source instanceof Uint8Array
      ? await validateBackupBytes(source)
      : await validateBackupBlob(source);

  return validation.format;
}

/**
 * Whether the file can go through the current backup upload path.
 *
 * That path is the worker pipeline, and the worker reads a SQLite image only,
 * so this app's own `.json` document is deliberately not accepted here: it is a
 * supported *format*, but restoring it is the local import path. Callers that
 * reject the file should surface {@link validateBackupBlob}'s `errors` rather
 * than a generic "invalid backup" message.
 */
export async function isSupportedBackupBlob(fileBlob: Blob): Promise<boolean> {
  const format = (await validateBackupBlob(fileBlob)).format;

  return format === 'pinpal-sqlite' || format === 'pinpal-lite-compound';
}
