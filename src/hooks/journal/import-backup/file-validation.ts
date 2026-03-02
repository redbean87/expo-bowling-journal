const SQLITE_HEADER = 'SQLite format 3\u0000';

type BlobWithArrayBuffer = Blob & {
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

async function readBlobSliceArrayBuffer(
  fileBlob: Blob,
  length: number
): Promise<ArrayBuffer> {
  const blobSlice = fileBlob.slice(0, length) as BlobWithArrayBuffer;

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

export async function isSupportedBackupBlob(fileBlob: Blob) {
  if (fileBlob.size <= 0) {
    return false;
  }

  const headerBuffer = await readBlobSliceArrayBuffer(
    fileBlob,
    SQLITE_HEADER.length
  );
  const headerText = new TextDecoder().decode(headerBuffer);

  return headerText === SQLITE_HEADER;
}
