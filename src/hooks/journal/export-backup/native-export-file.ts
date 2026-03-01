import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

type BlobReaderResult = string | ArrayBuffer | null;

const SQLITE_MIME_TYPE = 'application/octet-stream';

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onerror = () => {
      reject(new Error('Unable to read exported backup bytes.'));
    };

    fileReader.onloadend = () => {
      const result: BlobReaderResult = fileReader.result;

      if (typeof result !== 'string') {
        reject(new Error('Unable to encode exported backup bytes.'));
        return;
      }

      const delimiterIndex = result.indexOf(',');

      if (delimiterIndex < 0) {
        reject(new Error('Invalid backup data URL payload.'));
        return;
      }

      resolve(result.slice(delimiterIndex + 1));
    };

    fileReader.readAsDataURL(blob);
  });
}

export async function saveAndShareNativeBackupFile(
  backupBlob: Blob,
  fileName: string
) {
  if (!FileSystem.cacheDirectory) {
    throw new Error('Missing cache directory for backup export.');
  }

  const shareSupported = await Sharing.isAvailableAsync();

  if (!shareSupported) {
    throw new Error('Sharing is not available on this device.');
  }

  const backupFileUri = `${FileSystem.cacheDirectory}${fileName}`;
  const base64Payload = await readBlobAsDataUrl(backupBlob);

  await FileSystem.writeAsStringAsync(backupFileUri, base64Payload, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(backupFileUri, {
    mimeType: SQLITE_MIME_TYPE,
    dialogTitle: 'Export SQLite backup',
  });
}
