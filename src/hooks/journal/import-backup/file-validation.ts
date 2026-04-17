const SQLITE_HEADER = 'SQLite format 3\u0000';

// PinPal Lite iOS uses compound format: XML plist + padding + SQLite at offset 4096
const PINPAL_LITE_SQLITE_OFFSET = 4096;

export type DetectedImportFormat =
  | 'pinpal-sqlite'
  | 'pinpal-lite-compound'
  | null;

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

export async function detectBackupFormat(
  fileBlob: Blob
): Promise<DetectedImportFormat> {
  console.log('[Import Debug] File validation started:', {
    fileName: (fileBlob as File).name ?? 'unknown',
    fileSize: fileBlob.size,
    fileType: (fileBlob as File).type ?? 'unknown',
  });

  if (fileBlob.size <= 0) {
    console.log('[Import Debug] File size is 0 or negative');
    return null;
  }

  if (fileBlob.size < SQLITE_HEADER.length) {
    console.log(
      '[Import Debug] File too small:',
      fileBlob.size,
      'bytes (need at least',
      SQLITE_HEADER.length,
      ')'
    );
    return null;
  }

  // First, check for direct SQLite format
  const headerBuffer = await readBlobSliceArrayBuffer(
    fileBlob,
    SQLITE_HEADER.length
  );
  const headerText = new TextDecoder().decode(headerBuffer);

  const headerBytes = new Uint8Array(headerBuffer);
  const headerHex = Array.from(headerBytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

  console.log('[Import Debug] Header at offset 0:', {
    text: headerText.slice(0, 16),
    hex: headerHex,
    matches: headerText === SQLITE_HEADER,
  });

  if (headerText === SQLITE_HEADER) {
    console.log('[Import Debug] Detected: standard-sqlite');
    return 'pinpal-sqlite';
  }

  // Check for compound format (SQLite at offset 4096)
  if (fileBlob.size >= PINPAL_LITE_SQLITE_OFFSET + SQLITE_HEADER.length) {
    try {
      const offsetBuffer = await readBlobSliceArrayBuffer(
        fileBlob,
        SQLITE_HEADER.length,
        PINPAL_LITE_SQLITE_OFFSET
      );
      const offsetHeader = new TextDecoder().decode(offsetBuffer);

      const offsetBytes = new Uint8Array(offsetBuffer);
      const offsetHex = Array.from(offsetBytes.slice(0, 16))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');

      console.log('[Import Debug] Header at offset 4096:', {
        text: offsetHeader.slice(0, 16),
        hex: offsetHex,
        matches: offsetHeader === SQLITE_HEADER,
      });

      if (offsetHeader === SQLITE_HEADER) {
        console.log('[Import Debug] Detected: compound-sqlite');
        return 'pinpal-lite-compound';
      }
    } catch (error) {
      console.log('[Import Debug] Error reading offset 4096:', error);
    }
  } else {
    console.log(
      '[Import Debug] File too small for compound format check:',
      fileBlob.size,
      'bytes (need at least',
      PINPAL_LITE_SQLITE_OFFSET + SQLITE_HEADER.length,
      ')'
    );
  }

  console.log('[Import Debug] Detection failed: not a supported SQLite backup');
  return null;
}

export async function isSupportedBackupBlob(fileBlob: Blob): Promise<boolean> {
  const format = await detectBackupFormat(fileBlob);
  return format !== null;
}
