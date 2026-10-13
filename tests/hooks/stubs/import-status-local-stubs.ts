// Shared test doubles for the local import-status tests
// (`tests/hooks/import-status-local.test.ts`).
//
// Same module and remaps as the import-backup offline stubs, with one
// change: the `convex/react` double is sabotaged for reads. `useMutation`
// behaves exactly as in the offline suite (records and resolves with a
// sentinel `{ batchId }`); `useQuery` records the attempted query name and
// throws unless skipped. The import status must therefore render from the
// hook's own local state, and any attempt to read it from Convex is both
// recorded and fatal.

// --- Shared observable state ----------------------------------------------

// One entry per Convex operation attempted through the double, in call
// order. The local status read must leave this untouched.
export const convexOps: string[] = [];

// One entry per mutation invocation, in call order. The online start path
// must record the exact `startImport` input.
export const mutationCalls: Array<{ name: string; input: unknown }> = [];

// One entry per `uploadBackupFileAndStartImport` invocation, in call order.
export const uploadCalls: Array<UploadBackupCall> = [];

// Configurable result handed to `DocumentPicker.getDocumentAsync`, in call
// order of `pickBackupFile`.
let nextDocumentPickerResult: DocumentPickerResult | null = null;

export function setNextDocumentPickerResult(
  result: DocumentPickerResult
): void {
  nextDocumentPickerResult = result;
}

export function resetImportStatusLocalStubs(): void {
  convexOps.length = 0;
  mutationCalls.length = 0;
  uploadCalls.length = 0;
  nextDocumentPickerResult = null;
  __activeRenderer = null;
}

// --- 'react' double: mini hook dispatcher ---------------------------------
//
// The test file installs a small hook renderer (same hook-order contract
// as React) as the active renderer; these exports delegate to it.

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

// --- 'convex/react' double (reads sabotaged) ------------------------------
//
// `useMutation` mirrors the offline suite: a fresh callable that records
// the input and resolves to a sentinel `{ batchId }`, mirroring the
// `startImport` return shape (the write path is intentionally still
// server-driven this slice). `useQuery` records and throws on any non-skip
// args: the status read must come from local state.

export function useMutation(mutationRef: {
  name: string;
}): (input: unknown) => Promise<{ batchId: string }> {
  return async (input: unknown) => {
    mutationCalls.push({ name: mutationRef.name, input });

    return { batchId: 'server-batch' };
  };
}

export function useQuery(queryRef: { name: string }, args: unknown): undefined {
  if (args === 'skip') {
    return undefined;
  }

  const name = queryRef.name;
  convexOps.push(`query:${name}`);
  throw new Error(`Convex query attempted in local mode: ${name}`);
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
