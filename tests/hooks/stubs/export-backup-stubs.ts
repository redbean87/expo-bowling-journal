// Shared test doubles for the local journal-export hook tests
// (`tests/hooks/export-backup-local.test.ts`).
//
// One module is remapped (via `registerStubRemaps`) onto every specifier
// `src/hooks/journal/use-export-sqlite-backup.ts` imports that cannot load
// under the plain Node/tsx runner:
//
//   'react'                        -> mini hook dispatcher (useState/useCallback)
//   'react-native'                 -> Platform (runtime-configurable OS)
//   'expo-file-system/legacy'      -> cacheDirectory / writeAsStringAsync /
//                                      EncodingType (recording, configurable
//                                      failure)
//   'expo-sharing'                 -> isAvailableAsync / shareAsync (recording)
//   'convex/react'                 -> SABOTAGED useConvex / useConvexAuth:
//                                      they record and then throw, so any
//                                      Convex reach on the export path turns
//                                      into an export failure the suite sees
//
// `expo-file-system/legacy` and `expo-sharing` both resolve to this one file,
// which is why `import * as FileSystem` and `import * as Sharing` in
// `native-export-file.ts` see the same flat export set.
//
// Real modules run unmodified: `./export-backup/export-filename`,
// `./export-backup/native-export-file`,
// `@/services/local-journal/journal-backup-format` (the C-4 G1/G2 serializer)
// and `@/services/local-journal` (the accessor singleton over the real
// SQLite-backed service, whose `expo-sqlite` dependency the suite remaps to
// `tests/db/expo-sqlite-stub.mjs`).

// --- Shared observable state ----------------------------------------------

// One entry per `FileSystem.writeAsStringAsync` invocation, in call order:
// the target uri, the encoding the caller asked for, and the payload.
export const nativeWrites: Array<{
  uri: string;
  encoding: string | null;
  payload: string;
}> = [];

// One entry per `Sharing.shareAsync` invocation, in call order.
export const shareCalls: Array<{ uri: string; options: unknown }> = [];

// One entry per sabotaged Convex call the export path attempts. A converted
// local export must leave this empty.
export const convexOps: Array<{ kind: string }> = [];

// When non-null, the next `writeAsStringAsync` throws this message, standing
// in for a native file-write failure.
let nextWriteFailure: string | null = null;

// The `Platform.OS` the hook sees, read through a getter so a suite can pick
// the web or native delivery branch per test.
let platformOS = 'android';

// Whether `Sharing.isAvailableAsync` reports the share sheet as usable.
let sharingAvailable = true;

export function setNativeWriteFailure(message: string | null): void {
  nextWriteFailure = message;
}

export function setPlatformOS(os: string): void {
  platformOS = os;
}

export function setSharingAvailable(available: boolean): void {
  sharingAvailable = available;
}

export function resetExportBackupStubs(): void {
  nativeWrites.length = 0;
  shareCalls.length = 0;
  convexOps.length = 0;
  nextWriteFailure = null;
  platformOS = 'android';
  sharingAvailable = true;
  __activeRenderer = null;
}

// --- 'react' double: mini hook dispatcher ---------------------------------

type RendererHandle = {
  useState: (initial: unknown) => [unknown, (next: unknown) => void];
  useCallback: (
    callback: (...args: unknown[]) => unknown,
    deps: readonly unknown[] | undefined
  ) => (...args: unknown[]) => unknown;
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

// --- 'react-native' double -------------------------------------------------

export const Platform = {
  get OS(): string {
    return platformOS;
  },
};

// --- 'expo-file-system/legacy' double --------------------------------------

// The shape the app concatenates the file name onto; the suite asserts the
// exported artifact lands exactly here.
export const cacheDirectory = 'x-internal:///expo-cachedir/';

export const EncodingType = {
  Base64: 'base64',
  String: 'utf-8',
  UTF8: 'utf-8',
};

export async function writeAsStringAsync(
  uri: string,
  payload: string,
  options: Record<string, unknown> = {}
): Promise<void> {
  if (nextWriteFailure !== null) {
    throw new Error(nextWriteFailure);
  }

  nativeWrites.push({
    uri,
    encoding: (options.encoding as string | undefined) ?? null,
    payload,
  });
}

// --- 'expo-sharing' double --------------------------------------------------

export async function isAvailableAsync(): Promise<boolean> {
  return sharingAvailable;
}

export async function shareAsync(
  uri: string,
  options: Record<string, unknown> = {}
): Promise<void> {
  shareCalls.push({ uri, options });
}

// --- 'convex/react' double: sabotaged ---------------------------------------
//
// The export path used to open with `useConvex()`/`useConvexAuth()` and then
// `query` the cloud snapshot. This double records the attempt and throws, so
// the suite can prove the converted export never reaches that boundary: a
// Convex call would both land in `convexOps` and surface as an export error.

export function useConvex(): never {
  convexOps.push({ kind: 'useConvex' });

  throw new Error('Convex is sabotaged in this suite.');
}

export function useConvexAuth(): never {
  convexOps.push({ kind: 'useConvexAuth' });

  throw new Error('Convex is sabotaged in this suite.');
}
