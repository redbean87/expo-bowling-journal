// Shared test doubles for the backup-import hook offline tests
// (`tests/hooks/import-backup-offline.test.ts`).
//
// One module is remapped (via registerHooks) onto every specifier
// `src/hooks/journal/use-import-backup.ts` imports that cannot load under
// the plain Node/tsx runner:
//
//   'react'                                            -> mini hook dispatcher
//   'convex/react'                                     -> useMutation /
//                                                          useQuery
//   'react-native'                                     -> Platform
//   'expo-document-picker'                             -> configurable
//                                                          getDocumentAsync
//   '@/services/journal'                              -> convexJournalService
//                                                          (startImport /
//                                                          getImportStatus)
//   './import-backup/import-upload-client'            -> recording
//                                                          uploadBackupFileAndStartImport
//
// The stub is a .ts module (not .mjs) so that every import of it — the test's
// static import and each remapped specifier — goes through the same tsx
// transform cache and therefore shares one module instance.
//
// Real modules run unmodified: `@/services/connectivity` (Phase 1
// singleton, driven through `__connectivityTestControls` with a simulated
// netinfo source) and `./import-backup/file-picker-web` (no imports of its
// own; the web picker path is not exercised by these tests).

// --- Shared observable state ----------------------------------------------

// One entry per mutation invocation, in call order. The offline branch must
// leave this untouched; the online path must record the exact input.
export const mutationCalls: Array<{ name: string; input: unknown }> = [];

// One entry per `uploadBackupFileAndStartImport` invocation, in call order.
// The offline branch must leave this untouched.
export const uploadCalls: Array<UploadBackupCall> = [];

// Configurable result handed to `DocumentPicker.getDocumentAsync`, in call
// order of `pickBackupFile`.
let nextDocumentPickerResult: DocumentPickerResult | null = null;

export function setNextDocumentPickerResult(
  result: DocumentPickerResult
): void {
  nextDocumentPickerResult = result;
}

export function resetImportBackupStubs(): void {
  mutationCalls.length = 0;
  uploadCalls.length = 0;
  nextDocumentPickerResult = null;
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

export const Platform = { OS: 'ios' };

// --- 'expo-document-picker' double -----------------------------------------

export type DocumentPickerAsset = {
  name: string;
  uri: string;
  size: number;
  mimeType: string;
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
