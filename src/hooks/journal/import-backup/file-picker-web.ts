const WEB_BACKUP_ACCEPT =
  '.pinpal,.db,.sqlite,.sqlite3,.backup,application/x-sqlite3,application/vnd.sqlite3,application/octet-stream';

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
        types: [
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
        ],
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
