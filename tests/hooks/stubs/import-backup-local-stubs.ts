import { Buffer } from 'node:buffer';

// Test doubles for the local-first import hook's own tests
// (`tests/hooks/import-backup-local-routing.test.ts` and
// `tests/hooks/import-backup-local-restore.test.ts`).
//
// One module is remapped (via `registerStubRemaps`) onto every specifier
// `src/hooks/journal/use-import-backup.ts` imports that cannot load under the
// plain Node/tsx runner:
//
//   'react'                                -> mini hook dispatcher
//   'convex/react'                         -> useMutation / useQuery
//   'react-native'                         -> Platform (web or native)
//   'expo-document-picker'                 -> configurable getDocumentAsync
//   '@/services/journal'                   -> convexJournalService
//   './import-backup/import-upload-client' -> recording upload client
//   'expo-file-system/legacy'              -> the picked file, read as base64
//
// `@/services/connectivity` and `./import-backup/file-validation` run real:
// the offline guard is driven through `__connectivityTestControls`, and the
// format sniffing is pure enough to run under Node. The local restore's own
// modules (`@/services/local-journal` and
// `@/services/local-journal/pinpal-backup-import`) also run real; the test
// remaps 'expo-sqlite' onto the SQLite double the local-journal suites
// already use, so the restore writes into a real journal over a fake database.
//
// The stub is a .ts module (not .mjs) so that every import of it — the test's
// static import and each remapped specifier — goes through the same tsx
// transform cache and therefore shares one module instance.

// --- Shared observable state ----------------------------------------------

// One entry per Convex mutation invocation, in call order. A local restore
// must leave this untouched: the journal is written on the device.
export const mutationCalls: Array<{ name: string; input: unknown }> = [];

// One entry per `uploadBackupFileAndStartImport` invocation, in call order.
// A local restore must leave this untouched: nothing is sent to a worker.
export const uploadCalls: Array<UploadBackupCall> = [];

// One entry per `readAsStringAsync` invocation, in call order, so a test can
// name the format each picked file was read as.
export const fileReads: Array<{ uri: string; encoding: string | null }> = [];

// Configurable result handed to `DocumentPicker.getDocumentAsync`, in call
// order of `pickBackupFile`.
let nextDocumentPickerResult: DocumentPickerResult | null = null;

export function setNextDocumentPickerResult(
  result: DocumentPickerResult
): void {
  nextDocumentPickerResult = result;
}

// The picked file's bytes, by uri, held as base64 exactly as the legacy
// file system returns them. A uri with no entry cannot be read.
const backupFileContents = new Map<string, string>();

export function setBackupFileBytes(uri: string, bytes: Uint8Array): void {
  backupFileContents.set(uri, Buffer.from(bytes).toString('base64'));
}

export function setBackupFileUnreadable(uri: string): void {
  backupFileContents.delete(uri);
}

export function resetImportBackupLocalStubs(): void {
  mutationCalls.length = 0;
  uploadCalls.length = 0;
  fileReads.length = 0;
  nextDocumentPickerResult = null;
  backupFileContents.clear();
  __activeRenderer = null;
}

// --- 'react' double: mini hook dispatcher ---------------------------------
//
// The test file installs a small hook renderer (same hook-order contract as
// React) as the active renderer; these exports delegate to it.

type RendererHandle = {
  useState: (initial: unknown) => [unknown, (next: unknown) => void];
  useCallback: (
    callback: (...args: unknown[]) => unknown,
    deps: readonly unknown[] | undefined
  ) => (...args: unknown[]) => unknown;
  useMemo: <T>(factory: () => T, deps: readonly unknown[] | undefined) => T;
};

let __activeRenderer: RendererHandle | null = null;

function requireRenderer(): RendererHandle {
  if (!__activeRenderer) {
    throw new Error('No active hook renderer');
  }

  return __activeRenderer;
}

export function __setActiveRenderer(renderer: RendererHandle | null): void {
  __activeRenderer = renderer;
}

export function useState(initial: unknown): [unknown, (next: unknown) => void] {
  return requireRenderer().useState(initial);
}

export function useCallback(
  callback: (...args: unknown[]) => unknown,
  deps: readonly unknown[] | undefined
): (...args: unknown[]) => unknown {
  return requireRenderer().useCallback(callback, deps);
}

export function useMemo<T>(
  factory: () => T,
  deps: readonly unknown[] | undefined
): T {
  return requireRenderer().useMemo(factory, deps);
}

// --- 'convex/react' double ------------------------------------------------
//
// The service reference is an arrow function inside the object literal
// below, so `ref.name` is the service key. `useMutation` returns a fresh
// callable that records the input and resolves to a sentinel result with a
// `batchId`, mirroring the `startImport` return shape; `useQuery` stays
// pending (undefined) so the hook renders without live import status.

export function useMutation(mutationRef: {
  name: string;
}): (input: unknown) => Promise<{ batchId: string }> {
  return async (input: unknown) => {
    mutationCalls.push({ name: mutationRef.name, input });

    return { batchId: 'server-batch' };
  };
}

export function useQuery(_queryRef: unknown, _args: unknown): undefined {
  return undefined;
}

// --- 'react-native' double -------------------------------------------------

export const Platform = { OS: 'macos', getPlatform: () => 'macos' };

export function setPlatformOS(os: string): void {
  Platform.OS = os;
  Platform.getPlatform = () => os;
}

// --- 'expo-document-picker' double -----------------------------------------

export type DocumentPickerAsset = {
  name: string;
  uri: string;
  size: number;
  mimeType: string | null;
};

export type DocumentPickerResult = {
  canceled: boolean;
  assets: Array<DocumentPickerAsset>;
};

export async function getDocumentAsync(
  _options: Record<string, unknown>
): Promise<DocumentPickerResult> {
  if (nextDocumentPickerResult === null) {
    throw new Error('No document picker result configured');
  }

  return nextDocumentPickerResult;
}

// --- '@/services/journal' double -------------------------------------------

export const convexJournalService = {
  startImport: () => undefined,
  getImportStatus: () => undefined,
};

// --- './import-backup/import-upload-client' double ------------------------
//
// Records the exact input and then invokes the passed-in `startImport`
// mutation with a representative argument object, returning its result —
// mirroring the real client, which hands its `startImport` call straight
// back to the caller as the `{ batchId }` result.

export type UploadBackupCall = {
  workerBaseUrl: string;
  userId: unknown;
  selectedFile: {
    name: string;
    size: number;
    uri: string | null;
    mimeType: string | null;
    webFile: unknown;
  } | null;
  startImport: (input: Record<string, unknown>) => Promise<{ batchId: string }>;
};

export async function uploadBackupFileAndStartImport(
  input: UploadBackupCall
): Promise<{ batchId: string }> {
  uploadCalls.push(input);

  return input.startImport({
    r2Key: 'r2-key-test',
    fileName: input.selectedFile?.name ?? 'unknown',
    fileSize: input.selectedFile?.size ?? 0,
    checksum: null,
    idempotencyKey: 'idempotency-test',
    timezoneOffsetMinutes: 0,
  });
}

export function isSupportedBackupBlob(_blob: unknown): boolean {
  return true;
}

export function isSupportedBackupFile(_file: {
  name: string;
  size: number;
}): boolean {
  return true;
}

export function validateBackupFileNameBase64Size(
  _fileName: string,
  _fileSize: number
): void {}

// --- 'expo-file-system/legacy' double --------------------------------------
//
// The picked file, read as base64 the way the legacy file system hands it to
// a native caller. A uri with no configured content fails the read, which is
// how a file the app cannot open behaves.

export const cacheDirectory = 'file:///tmp/expo-cache/';
export const EncodingType = { UTF8: 'utf8', Base64: 'base64' };

export async function readAsStringAsync(
  uri: string,
  options: Record<string, unknown> | null
): Promise<string> {
  const encoding =
    typeof options?.encoding === 'undefined' ? null : String(options.encoding);

  fileReads.push({ uri, encoding });

  const contents = backupFileContents.get(uri);
  if (contents === undefined) {
    throw new Error(`No content configured for ${uri}`);
  }

  return contents;
}

export async function getInfoAsync(
  uri: string,
  _options: Record<string, unknown> | null
): Promise<{ exists: boolean; size: number }> {
  const contents = backupFileContents.get(uri);
  if (contents === undefined) {
    return { exists: false, size: 0 };
  }

  return {
    exists: true,
    size: Buffer.from(contents, 'base64').length,
  };
}

export async function writeAsStringAsync(
  _uri: string,
  _contents: string,
  _options: Record<string, unknown> | null
): Promise<void> {}

export async function copyAsync(
  _options: Record<string, unknown>
): Promise<void> {}

export async function deleteAsync(
  _options: Record<string, unknown>
): Promise<void> {}
