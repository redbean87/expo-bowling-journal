/**
 * C-1d — which picked file the import restores locally, and which it still
 * sends to the worker, plus the offline local restore that needs neither a
 * worker URL, a signed-in user, nor a live connection.
 *
 * The routing decision is the format sniff (`detectBackupFormat`) over the
 * file's own bytes, so the suite names the format each fixture is sniffed as
 * next to where it goes:
 *
 *   - a PinPal SQLite image (the Android dialect's raw `.db`) and the iOS
 *     dialect's plist-wrapped compound `.db` are restored on the device: no
 *     upload, no Convex mutation, and the journal is written locally;
 *   - the JSON envelope the app used to ship, and bytes that are not a
 *     backup at all, keep the existing worker path (and the offline guard
 *     still stops them when there is no connection);
 *   - a file the app cannot open keeps the worker path too, so a failed
 *     native read is never mistaken for a local restore.
 *
 * The local restore reports the importer's own restored counts and skipped
 * rows, so a partial import — one frame row whose game never came in — is
 * visible instead of silent.
 *
 * The picked file is faked (the legacy file system hands a native picker
 * result as base64, and a uri with no configured content fails the read);
 * the journal is real, over the same `node:sqlite`-backed `expo-sqlite`
 * double the local-journal suites use. The fixtures are the real export
 * dialects' own bytes, so the import half is proven against the export half.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  fixtureFiles,
  fixtureSnapshot,
  partialFixtureFile,
} from './fixtures/import-backup-fixtures';
import {
  __setActiveRenderer,
  mutationCalls,
  resetImportBackupLocalStubs,
  setBackupFileBytes,
  setBackupFileUnreadable,
  setNextDocumentPickerResult,
  uploadCalls,
} from './stubs/import-backup-local-stubs';
import { __connectivityTestControls } from '../../src/services/connectivity';
import {
  createFakeNetInfo,
  type FakeNetInfo,
  type FakeNetInfoState,
} from '../harness/fake-env';
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

// Dynamic import so the stub remaps registered above are in effect when the
// hook resolves its own imports.
function getImportModule(): Promise<ImportModule> {
  importModulePromise ??= import('../../src/hooks/journal/use-import-backup');

  return importModulePromise;
}

// --- Test harness ----------------------------------------------------------

type MountedImportBackup = {
  fake: FakeNetInfo;
  unmount(): void;
  apiRef: { current: ImportApi | null };
};

async function mountImportBackup(
  initial: FakeNetInfoState
): Promise<MountedImportBackup> {
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
    fake,
    unmount(): void {
      renderer.unmount();
      __connectivityTestControls.reset();
    },
    apiRef,
  };
}

// The api object the hook last rendered: state updates schedule a re-render,
// so a test reads the api only after the microtasks have been drained.
function currentApi(harness: MountedImportBackup): ImportApi {
  const api = harness.apiRef.current;
  if (api === null) {
    throw new Error('Backup import hook did not mount');
  }

  return api;
}

// Drain microtasks and the promise chains they drive (the mini renderer
// commits state updates as microtasks).
async function settle(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

/**
 * Configure the picker to hand over a file, and the fake legacy file system
 * to serve that file's bytes. `size` is what the picker reported, so the
 * hook's own `getInfoAsync` correction is exercised too.
 */
function pickNativeFile(
  harness: MountedImportBackup,
  name: string,
  uri: string,
  bytes: Uint8Array
): void {
  setBackupFileBytes(uri, bytes);
  setNextDocumentPickerResult({
    canceled: false,
    assets: [
      {
        name,
        uri,
        size: bytes.length,
        mimeType: null,
      },
    ],
  });

  // Picking a file is local: it works with no connection.
  void currentApi(harness).pickBackupFile();
}

function expectNothingSentToTheServer(): void {
  assert.equal(uploadCalls.length, 0, 'nothing was uploaded to a worker');
  assert.equal(mutationCalls.length, 0, 'nothing was sent to the server');
}

function expectLocalRestore(api: ImportApi): void {
  assert.equal(api.error, null, 'the import reported no error');
  assert.notEqual(
    api.localImportReport,
    null,
    'the local restore reported its own counts'
  );
  assert.equal(api.importStatus?.status, 'completed');
  assert.equal(
    api.importStatus?.batchId,
    null,
    'no server import batch was created'
  );
}

// --- Tests -----------------------------------------------------------------

test('offline: a PinPal .db is restored on the device, no worker no user', async () => {
  const files = await fixtureFiles();
  const snapshot = fixtureSnapshot();

  const harness = await mountImportBackup({
    isConnected: false,
    type: 'none',
  });

  try {
    pickNativeFile(
      harness,
      'pinpal-backup.pinpal',
      'file:///pick/pinpal-backup.pinpal',
      files.androidPinpal
    );
    await settle();

    await currentApi(harness).startBackupImport('', null);
    await settle();

    const api = currentApi(harness);
    expectNothingSentToTheServer();
    expectLocalRestore(api);

    assert.equal(
      api.importStatus?.counts.games,
      snapshot.games.length,
      'every game in the image reached the journal'
    );
    assert.equal(
      api.importStatus?.counts.weeks,
      snapshot.sessions.length,
      'every session reached the journal'
    );
    assert.equal(
      api.importStatus?.counts.warnings,
      0,
      'the image held nothing the journal could not place'
    );
  } finally {
    harness.unmount();
  }
});

test('offline: the iOS dialect .db is restored on the device too', async () => {
  const files = await fixtureFiles();

  const harness = await mountImportBackup({
    isConnected: false,
    type: 'none',
  });

  try {
    pickNativeFile(
      harness,
      'pinpal-backup.pinpal',
      'file:///pick/ios-pinpal-backup.pinpal',
      files.iosPinpal
    );
    await settle();

    await currentApi(harness).startBackupImport('', null);
    await settle();

    const api = currentApi(harness);
    expectNothingSentToTheServer();
    expectLocalRestore(api);

    assert.equal(
      api.importStatus?.counts.games,
      fixtureSnapshot().games.length,
      'the narrower container still restored every game'
    );
  } finally {
    harness.unmount();
  }
});

test('a partial import reports the rows the journal could not place', async () => {
  const partial = await partialFixtureFile();
  const snapshot = fixtureSnapshot();

  const harness = await mountImportBackup({
    isConnected: false,
    type: 'none',
  });

  try {
    pickNativeFile(
      harness,
      'pinpal-backup.pinpal',
      'file:///pick/partial-pinpal.pinpal',
      partial
    );
    await settle();

    await currentApi(harness).startBackupImport('', null);
    await settle();

    const api = currentApi(harness);
    expectNothingSentToTheServer();
    expectLocalRestore(api);

    const skipped = api.localImportReport?.skipped;

    assert.equal(
      skipped?.frames,
      1,
      'the frame row whose game never came in is counted as skipped'
    );
    assert.equal(
      api.importStatus?.counts.warnings,
      (skipped?.houses ?? 0) +
        (skipped?.patterns ?? 0) +
        (skipped?.balls ?? 0) +
        (skipped?.leagues ?? 0) +
        (skipped?.weeks ?? 0) +
        (skipped?.games ?? 0) +
        (skipped?.frames ?? 0),
      'the profile shows the skipped-row total the importer reported'
    );
    assert.equal(
      api.importStatus?.counts.games,
      snapshot.games.length,
      'the orphan row did not cost a game its own game'
    );
  } finally {
    harness.unmount();
  }
});

test('the JSON envelope the app used to ship keeps the worker path', async () => {
  const files = await fixtureFiles();

  const harness = await mountImportBackup({
    isConnected: false,
    type: 'none',
  });

  try {
    pickNativeFile(
      harness,
      'journal-backup.json',
      'file:///pick/journal-backup.json',
      files.journalJson
    );
    await settle();

    await currentApi(harness).startBackupImport('', null);
    await settle();

    const api = currentApi(harness);
    expectNothingSentToTheServer();
    assert.equal(
      api.error,
      'You appear to be offline. Reconnect to import this backup.',
      'a file the local path cannot handle still needs a connection'
    );
    assert.equal(api.localImportReport, null, 'no local restore ran');
  } finally {
    harness.unmount();
  }
});

test('bytes that are not a backup keep the worker path', async () => {
  const files = await fixtureFiles();

  const harness = await mountImportBackup({
    isConnected: true,
    type: 'wifi',
  });

  try {
    pickNativeFile(
      harness,
      'notes.txt',
      'file:///pick/notes.txt',
      files.notABackup
    );
    await settle();

    await currentApi(harness).startBackupImport(
      'https://example-worker.test',
      'user-1' as never
    );
    await settle();

    const api = currentApi(harness);
    assert.equal(api.error, null, 'the existing flow started');
    assert.equal(uploadCalls.length, 1, 'the upload ran once');
    assert.equal(mutationCalls.length, 1, 'the server import was started');
    assert.equal(
      mutationCalls[0].name,
      'startImport',
      'the existing mutation is the one that ran'
    );
    assert.equal(api.localImportReport, null, 'no local restore ran');
  } finally {
    harness.unmount();
  }
});

test('a file the app cannot open keeps the worker path', async () => {
  const files = await fixtureFiles();

  const harness = await mountImportBackup({
    isConnected: false,
    type: 'none',
  });

  try {
    pickNativeFile(
      harness,
      'pinpal-backup.pinpal',
      'file:///pick/unreadable-pinpal.pinpal',
      files.androidPinpal
    );
    await settle();

    setBackupFileUnreadable('file:///pick/unreadable-pinpal.pinpal');

    await currentApi(harness).startBackupImport('', null);
    await settle();

    const api = currentApi(harness);
    expectNothingSentToTheServer();
    assert.equal(
      api.error,
      'You appear to be offline. Reconnect to import this backup.',
      'an unreadable file is not treated as a local restore'
    );
    assert.equal(api.localImportReport, null, 'no local restore ran');
  } finally {
    harness.unmount();
  }
});

test('the native picker hands the picked file to the local restore', async () => {
  const files = await fixtureFiles();

  const harness = await mountImportBackup({
    isConnected: false,
    type: 'none',
  });

  try {
    pickNativeFile(
      harness,
      'pinpal-backup.pinpal',
      'file:///pick/picked-pinpal.pinpal',
      files.androidPinpal
    );
    await settle();

    const picked = currentApi(harness).selectedFile;
    assert.equal(
      picked?.name,
      'pinpal-backup.pinpal',
      'the picker handed the file over'
    );
    assert.equal(
      picked?.size,
      files.androidPinpal.length,
      'the file size the hook holds is the file on disk'
    );

    await currentApi(harness).startBackupImport('', null);
    await settle();

    expectNothingSentToTheServer();
    expectLocalRestore(currentApi(harness));
  } finally {
    harness.unmount();
  }
});
