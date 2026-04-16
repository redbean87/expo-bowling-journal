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
  if (fileBlob.size <= 0) {
    return null;
  }

  // First, check for direct SQLite format (standard PinPal)
  const headerBuffer = await readBlobSliceArrayBuffer(
    fileBlob,
    SQLITE_HEADER.length
  );
  const headerText = new TextDecoder().decode(headerBuffer);

  if (headerText === SQLITE_HEADER) {
    return 'pinpal-sqlite';
  }

  // Check for PinPal Lite compound format (SQLite at offset 4096)
  if (fileBlob.size >= PINPAL_LITE_SQLITE_OFFSET + SQLITE_HEADER.length) {
    try {
      const offsetBuffer = await readBlobSliceArrayBuffer(
        fileBlob,
        SQLITE_HEADER.length,
        PINPAL_LITE_SQLITE_OFFSET
      );
      const offsetHeader = new TextDecoder().decode(offsetBuffer);

      if (offsetHeader === SQLITE_HEADER) {
        return 'pinpal-lite-compound';
      }
    } catch {
      // Fall through to return null
    }
  }

  return null;
}

export async function isSupportedBackupBlob(fileBlob: Blob): Promise<boolean> {
  const format = await detectBackupFormat(fileBlob);
  return format !== null;
}
