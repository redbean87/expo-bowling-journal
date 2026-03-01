const WINDOWS_RESERVED_FILE_CHARS = /[<>:"/\\|?*]/g;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

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

  return withoutReserved.toLowerCase().endsWith('.db')
    ? withoutReserved
    : `${withoutReserved}.db`;
}
