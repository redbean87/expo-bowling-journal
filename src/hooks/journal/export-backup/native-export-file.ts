/**
 * C-4 T4 — the delivery boundary: the one image this app builds becomes one
 * file in the device's cache directory, opened in the share sheet.
 *
 * The image arrives as bytes, not as a `Blob`. React Native's `Blob` — the
 * polyfill `@expo/metro-runtime` installs on a device — refuses parts that
 * carry bytes, throwing "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView'
 * are not supported" before a single byte is written, so wrapping the image in
 * a `Blob` here would make every device export fail on the phone while still
 * passing on Node, where the global `Blob` accepts those parts. The bytes are
 * therefore handed over unwrapped and encoded here, in JavaScript, so the
 * native path touches neither `Blob` nor `FileReader`.
 *
 * The encoding is the one `expo-file-system/legacy` already writes binary
 * with — base64 — which is also the encoding the import side reads the same
 * file back with (`@/hooks/journal/use-import-backup`'s `readAsStringAsync`
 * with `encoding: 'base64'`), so the artifact a device writes is a file a
 * device can read back byte for byte.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const SQLITE_MIME_TYPE = 'application/octet-stream';

/** The radix-64 alphabet `expo-file-system/legacy` writes a file with. */
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The image bytes as the base64 payload `writeAsStringAsync` expects.
 *
 * This is the inverse of the decoder in `@/hooks/journal/use-import-backup`,
 * written in plain JavaScript rather than through `Blob`, `FileReader`, or
 * `Buffer`: none of those three exist usefully on a device for binary bytes
 * (no `Buffer` in Hermes, and `Blob`/`FileReader` reject the bytes outright),
 * and the suite that pins this helper runs under the same restriction.
 */
function encodeBytesAsBase64(bytes: Uint8Array): string {
  const groups: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += 3) {
    const remaining = bytes.length - offset;

    const byte0 = bytes[offset];
    const byte1 = remaining > 1 ? bytes[offset + 1] : 0;
    const byte2 = remaining > 2 ? bytes[offset + 2] : 0;

    const triplet = (byte0 << 16) | (byte1 << 8) | byte2;

    groups.push(
      BASE64_ALPHABET[(triplet >> 18) & 0x3f] +
        BASE64_ALPHABET[(triplet >> 12) & 0x3f] +
        (remaining > 1 ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '=') +
        (remaining > 2 ? BASE64_ALPHABET[triplet & 0x3f] : '=')
    );
  }

  return groups.join('');
}

export async function saveAndShareNativeBackupFile(
  backupImage: Uint8Array,
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
  const base64Payload = encodeBytesAsBase64(backupImage);

  await FileSystem.writeAsStringAsync(backupFileUri, base64Payload, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(backupFileUri, {
    mimeType: SQLITE_MIME_TYPE,
    dialogTitle: 'Export SQLite backup',
  });
}
