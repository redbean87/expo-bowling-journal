/**
 * C-1d device runtime — the PinPal round trip on a runtime that lacks the
 * web APIs Node has.
 *
 * This is the captain's scenario: the picked file's bytes are sniffed, and the
 * restore mints an id for every entity it writes. On the phone neither step has
 * the API Node provides — React Native's `Blob` refuses the bytes
 * ("Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported")
 * and Hermes has no `crypto.randomUUID()` — so the suite installs both
 * absences and drives the REAL hook over the REAL dialect fixtures: a PinPal
 * `.db` is still restored on the device, with nothing uploaded and nothing
 * reported as an error.
 *
 * The harness is the local-routing suite's (same picker stub, same
 * `expo-sqlite` double); what this suite adds is the device simulation, so a
 * restore that only works because Node happens to have the missing APIs fails
 * here.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  fixtureFiles,
  fixtureSnapshot,
} from './fixtures/import-backup-fixtures';
import {
  __setActiveRenderer,
  mutationCalls,
  resetImportBackupLocalStubs,
  setBackupFileBytes,
  setNextDocumentPickerResult,
  uploadCalls,
} from './stubs/import-backup-local-stubs';
import { __connectivityTestControls } from '../../src/services/connectivity';
import { withHermesRuntime } from '../harness/device-runtime-globals';
import { createFakeNetInfo, type FakeNetInfoState } from '../harness/fake-env';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

type ImportModule = typeof import('../../src/hooks/journal/use-import-backup');
type ImportApi = ReturnType<ImportModule['useImportBackup']>;

const stubPath = path.join(__dirname, 'stubs', 'import-backup-local-stubs.ts');

const stubRewrites: Record<string, string> = {
  react: stubPath,
  'convex/react': stubPath,
  'react-native': stubPath,
  'expo-document-picker': stubPath,
  '@/services/journal': stubPath,
  './import-backup/import-upload-client': stubPath,
  'expo-file-system/legacy': stubPath,
  'expo-sqlite': path.join(
    __dirname,
    '..',
    'local-journal',
    'stubs',
    'pinpal-import-expo-sqlite-stub.mjs'
  ),
};

const hookHandle = registerStubRemaps(() => stubRewrites);

after(() => {
  hookHandle.deregister();
});

let importModulePromise: Promise<ImportModule> | null = null;

function getImportModule(): Promise<ImportModule> {
  importModulePromise ??= import('../../src/hooks/journal/use-import-backup');

  return importModulePromise;
}

async function mountImportBackup(
  initial: FakeNetInfoState
): Promise<{ unmount(): void; apiRef: { current: ImportApi | null } }> {
  __connectivityTestControls.reset();
  resetImportBackupLocalStubs();

  const fake = createFakeNetInfo(initial, true);
  __connectivityTestControls.useNetInfoModule(fake.mod);

  const { useImportBackup } = await getImportModule();

  const apiRef: { current: ImportApi | null } = { current: null };

  const renderer = new MiniReact(() => {
    apiRef.current = useImportBackup();

    return null;
  }, __setActiveRenderer);

  renderer.mount();

  if (apiRef.current === null) {
    throw new Error('Backup import hook did not mount');
  }

  return {
    unmount(): void {
      renderer.unmount();
      __connectivityTestControls.reset();
    },
    apiRef,
  };
}

function currentApi(harness: {
  apiRef: { current: ImportApi | null };
}): ImportApi {
  if (harness.apiRef.current === null) {
    throw new Error('Backup import hook did not mount');
  }

  return harness.apiRef.current;
}

async function settle(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

function pickNativeFile(
  harness: { apiRef: { current: ImportApi | null } },
  name: string,
  uri: string,
  bytes: Uint8Array
): void {
  setBackupFileBytes(uri, bytes);
  setNextDocumentPickerResult({
    canceled: false,
    assets: [{ name, uri, size: bytes.length, mimeType: null }],
  });

  void currentApi(harness).pickBackupFile();
}

/**
 * One picked file, one import, on a runtime with no `randomUUID` and a `Blob`
 * that refuses bytes.
 */
async function importOnDevice(
  bytes: Uint8Array,
  name: string
): Promise<ImportApi> {
  const harness = await mountImportBackup({ isConnected: false, type: 'none' });

  try {
    pickNativeFile(harness, name, `file:///pick/${name}`, bytes);
    await settle();

    await withHermesRuntime(async () => {
      await currentApi(harness).startBackupImport('', null);
      await settle();
    });

    return currentApi(harness);
  } finally {
    harness.unmount();
  }
}

test('a PinPal .db is restored on a device that has neither web API', async () => {
  const files = await fixtureFiles();
  const snapshot = fixtureSnapshot();

  const api = await importOnDevice(files.androidPinpal, 'pinpal-backup.pinpal');

  assert.equal(api.error, null, 'the device runtime reported no failure');
  assert.notEqual(api.localImportReport, null, 'the local restore ran');
  assert.equal(uploadCalls.length, 0, 'nothing was uploaded to a worker');
  assert.equal(mutationCalls.length, 0, 'nothing was sent to the server');
  assert.equal(
    api.importStatus?.counts.games,
    snapshot.games.length,
    'every game in the image reached the journal'
  );
});

test('the iOS dialect is restored on that device too', async () => {
  const files = await fixtureFiles();
  const snapshot = fixtureSnapshot();

  const api = await importOnDevice(files.iosPinpal, 'pinpal-backup.pinpal');

  assert.equal(api.error, null, 'the device runtime reported no failure');
  assert.notEqual(api.localImportReport, null, 'the local restore ran');
  assert.equal(
    api.importStatus?.counts.games,
    snapshot.games.length,
    'the narrower container still restored every game'
  );
});
