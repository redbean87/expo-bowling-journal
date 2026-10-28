/**
 * The extensions a browser may offer when picking a backup file.
 *
 * `.json` is this app's own journal backup (the versioned envelope written by
 * `src/services/local-journal/journal-backup-format.ts`); the remaining
 * extensions are the legacy PinPal import formats, which stay supported as a
 * separate compatibility path. The list only *narrows* what a browser will
 * show: the selected file is still classified from its bytes by
 * `./file-validation`, so an extension is never taken as proof of content.
 */
export const WEB_BACKUP_PICKER_TYPES: Array<{
  description: string;
  accept: Record<string, string[]>;
}> = [
  {
    description: 'Bowling journal backup',
    accept: {
      'application/json': ['.json'],
      'application/octet-stream': ['.json'],
    },
  },
  {
    description: 'PinPal backup files',
    accept: {
      'application/octet-stream': [
        '.pinpal',
        '.db',
        '.sqlite',
        '.sqlite3',
        '.backup',
      ],
      'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'],
      'application/vnd.sqlite3': ['.db', '.sqlite', '.sqlite3'],
    },
  },
];

export const WEB_BACKUP_ACCEPT = Array.from(
  new Set(
    WEB_BACKUP_PICKER_TYPES.flatMap((pickerType) => [
      ...Object.keys(pickerType.accept),
      ...Object.values(pickerType.accept).flat(),
    ])
  )
).join(',');

type FilePickerFileHandleLike = {
  getFile: () => Promise<File>;
};

type ShowOpenFilePickerLike = (options?: {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<FilePickerFileHandleLike[]>;

function isAbortError(caught: unknown) {
  if (!caught || typeof caught !== 'object') {
    return false;
  }

  return 'name' in caught && caught.name === 'AbortError';
}

export async function pickBackupFileOnWeb(): Promise<File | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  const openFilePicker = (
    window as Window & { showOpenFilePicker?: ShowOpenFilePickerLike }
  ).showOpenFilePicker;

  if (openFilePicker) {
    try {
      const handles = await openFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: WEB_BACKUP_PICKER_TYPES,
      });

      const fileHandle = handles[0];

      if (!fileHandle) {
        return null;
      }

      return fileHandle.getFile();
    } catch (caught) {
      if (isAbortError(caught)) {
        return null;
      }
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = WEB_BACKUP_ACCEPT;
    input.multiple = false;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    const finalize = (file: File | null) => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      input.remove();
      resolve(file);
    };

    const onChange = () => {
      finalize(input.files?.[0] ?? null);
    };

    const onCancel = () => {
      finalize(null);
    };

    input.addEventListener('change', onChange, { once: true });
    input.addEventListener('cancel', onCancel, { once: true });
    input.click();
  });
}
