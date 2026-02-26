const SQLITE_HEADER = 'SQLite format 3\u0000';

export async function isSupportedBackupBlob(fileBlob: Blob) {
  if (fileBlob.size <= 0) {
    return false;
  }

  const headerBuffer = await fileBlob
    .slice(0, SQLITE_HEADER.length)
    .arrayBuffer();
  const headerText = new TextDecoder().decode(headerBuffer);

  return headerText === SQLITE_HEADER;
}
