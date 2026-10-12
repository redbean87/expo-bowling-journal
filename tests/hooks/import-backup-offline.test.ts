import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  type DocumentPickerResult,
  __setActiveRenderer,
  mutationCalls,
  resetImportBackupStubs,
  setNextDocumentPickerResult,
  uploadCalls,
} from './stubs/import-backup-stubs';
import { __connectivityTestControls } from '../../src/services/connectivity';
import {
  createFakeNetInfo,
  type FakeNetInfo,
  type FakeNetInfoState,
} from '../harness/fake-env';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

// Backup-import hook offline tests.
//
// `use-import-backup.ts` runs under the plain Node/tsx runner with every
// un-Node-able import remapped to local test doubles ('react' mini hook
// dispatcher, 'convex/react', 'react-native', `expo-document-picker`,
// `@/services/journal`, and the `import-upload-client` that performs the
// worker upload plus the `startImport` mutation).
//
// Real modules run unmodified: the Phase 1 connectivity singleton
// (`@/services/connectivity`) — driven through
// `__connectivityTestControls` with a simulated netinfo source — and
// `file-picker-web` (not exercised; the native document-picker path is
// used).
//
// Covered: offline → `startBackupImport` does not start (no upload, no
// `startImport` mutation, `isUploading` never set) and surfaces a clear
// offline message through the hook's existing error state; online →
// behavior-identical upload + `startImport` flow with the exact input and
// the propagated `{ batchId }` result; plus the offline→online recovery.

const stubDir = path.join(__dirname, 'stubs');
const stubPath = path.join(stubDir, 'import-backup-stubs.ts');
const stubRewrites: Record<string, string> = {
  react: stubPath,
  'convex/react': stubPath,
  'react-native': stubPath,
  'expo-document-picker': stubPath,
  '@/services/journal': stubPath,
  './import-backup/import-upload-client': stubPath,
};

const hookHandle = registerStubRemaps(() => stubRewrites);

after(() => {
  hookHandle.deregister();
});

type ImportBackupModule =
  typeof import('../../src/hooks/journal/use-import-backup');
type ImportBackupApi = ReturnType<ImportBackupModule['useImportBackup']>;

let importBackupModulePromise: Promise<ImportBackupModule> | null = null;

// Dynamic import is required so the stub remaps (registered above) are in
// effect when the hook resolves its imports.
function getImportBackupModule(): Promise<ImportBackupModule> {
  importBackupModulePromise ??=
    import('../../src/hooks/journal/use-import-backup');

  return importBackupModulePromise;
}

// --- Test harness ----------------------------------------------------------

type MountedImportBackup = {
  fake: FakeNetInfo;
  unmount(): void;
  apiRef: { current: ImportBackupApi | null };
};

async function mountImportBackup(
  initial: FakeNetInfoState
): Promise<MountedImportBackup> {
  __connectivityTestControls.reset();
  resetImportBackupStubs();

  const fake = createFakeNetInfo(initial, true);
  __connectivityTestControls.useNetInfoModule(fake.mod);

  const { useImportBackup } = await getImportBackupModule();

  const apiRef: { current: ImportBackupApi | null } = { current: null };

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

// Drain microtasks and the promise chains they drive (the mini renderer
// commits state updates as microtasks).
async function settle(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

const BACKUP_FILE: DocumentPickerResult['assets'][number] = {
  name: 'backup.sqlite3',
  uri: 'file:///tmp/backup.sqlite3',
  size: 1234,
  mimeType: 'application/octet-stream',
};

function pickConfiguredBackupFile(): DocumentPickerResult {
  return {
    canceled: false,
    assets: [
      {
        name: BACKUP_FILE.name,
        uri: BACKUP_FILE.uri,
        size: BACKUP_FILE.size,
        mimeType: BACKUP_FILE.mimeType,
      },
    ],
  };
}

// --- Tests -----------------------------------------------------------------

test('offline: startBackupImport does not start and surfaces the offline message', async () => {
  const harness = await mountImportBackup({ isConnected: false, type: 'none' });

  try {
    // Picking a file is local and works offline.
    setNextDocumentPickerResult(pickConfiguredBackupFile());
    await harness.apiRef.current!.pickBackupFile();
    await settle();
    assert.equal(harness.apiRef.current!.selectedFile?.name, 'backup.sqlite3');
    assert.equal(harness.apiRef.current!.error, null);

    await harness.apiRef.current!.startBackupImport(
      'http://127.0.0.1:8787',
      'user-1' as never
    );
    await settle();

    assert.equal(
      harness.apiRef.current!.error,
      'You appear to be offline. Reconnect to import this backup.'
    );
    assert.equal(harness.apiRef.current!.isUploading, false);
    assert.equal(harness.apiRef.current!.activeBatchId, null);

    // No upload request or import mutation was attempted.
    assert.equal(uploadCalls.length, 0);
    assert.equal(mutationCalls.length, 0);
  } finally {
    harness.unmount();
  }
});

test('online: startBackupImport runs the existing upload + startImport flow', async () => {
  const harness = await mountImportBackup({ isConnected: true, type: 'wifi' });

  try {
    setNextDocumentPickerResult(pickConfiguredBackupFile());
    await harness.apiRef.current!.pickBackupFile();
    await settle();
    assert.equal(harness.apiRef.current!.selectedFile?.name, 'backup.sqlite3');

    await harness.apiRef.current!.startBackupImport(
      'http://127.0.0.1:8787',
      'user-1' as never
    );
    await settle();

    assert.equal(harness.apiRef.current!.error, null);
    assert.equal(harness.apiRef.current!.isUploading, false);
    assert.equal(
      harness.apiRef.current!.selectedFileLabel,
      'backup.sqlite3 (1.2 KB)'
    );

    // The upload client ran once with the exact existing input.
    assert.equal(uploadCalls.length, 1);
    assert.equal(uploadCalls[0].workerBaseUrl, 'http://127.0.0.1:8787');
    assert.equal(uploadCalls[0].userId, 'user-1');
    assert.equal(uploadCalls[0].selectedFile?.name, 'backup.sqlite3');
    assert.equal(uploadCalls[0].selectedFile?.size, 1234);
    assert.equal(
      uploadCalls[0].selectedFile?.uri,
      'file:///tmp/backup.sqlite3'
    );

    // And the startImport mutation received the client's start arguments.
    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0].name, 'startImport');
    assert.deepStrictEqual(mutationCalls[0].input, {
      r2Key: 'r2-key-test',
      fileName: 'backup.sqlite3',
      fileSize: 1234,
      checksum: null,
      idempotencyKey: 'idempotency-test',
      timezoneOffsetMinutes: 0,
    });

    // The mutation's batch id is still propagated into the active batch.
    assert.equal(harness.apiRef.current!.activeBatchId, 'server-batch');
  } finally {
    harness.unmount();
  }
});

test('offline to online: recovery starts the existing flow without re-picking', async () => {
  const harness = await mountImportBackup({ isConnected: false, type: 'none' });

  try {
    setNextDocumentPickerResult(pickConfiguredBackupFile());
    await harness.apiRef.current!.pickBackupFile();
    await settle();

    await harness.apiRef.current!.startBackupImport(
      'http://127.0.0.1:8787',
      'user-1' as never
    );
    await settle();
    assert.equal(uploadCalls.length, 0);

    harness.fake.emit({ isConnected: true, type: 'wifi' });

    await harness.apiRef.current!.startBackupImport(
      'http://127.0.0.1:8787',
      'user-1' as never
    );
    await settle();

    assert.equal(harness.apiRef.current!.error, null);
    assert.equal(harness.apiRef.current!.isUploading, false);
    assert.equal(uploadCalls.length, 1);
    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0].name, 'startImport');
    assert.equal(harness.apiRef.current!.activeBatchId, 'server-batch');
  } finally {
    harness.unmount();
  }
});
