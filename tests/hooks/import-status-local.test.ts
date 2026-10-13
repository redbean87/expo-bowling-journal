// Local import-status tests for the backup-import hook (C-1d).
//
// `use-import-backup.ts` runs under the plain Node/tsx runner with the
// same remaps as the import-backup offline suite, except the
// `convex/react` double is sabotaged for reads: any `useQuery` that is
// not skipped records the query name and throws.
//
// The import status read is off the server as of this slice: after an
// import starts, the status renders from the hook's own local state — the
// started import enters the transition rules in their first state,
// `queued` (the server batch advances it) — and no Convex query is
// attempted. The write path (worker upload plus `startImport` mutation)
// is intentionally still server-driven this slice and is asserted
// unchanged.

import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  convexOps,
  type DocumentPickerResult,
  mutationCalls,
  __setActiveRenderer,
  resetImportStatusLocalStubs,
  setNextDocumentPickerResult,
  uploadCalls,
} from './stubs/import-status-local-stubs';
import { __connectivityTestControls } from '../../src/services/connectivity';
import {
  createFakeNetInfo,
  type FakeNetInfo,
  type FakeNetInfoState,
} from '../harness/fake-env';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

const stubDir = path.join(__dirname, 'stubs');
const stubPath = path.join(stubDir, 'import-status-local-stubs.ts');
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
  resetImportStatusLocalStubs();

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

test('before an import starts, the status is null with zero Convex reads', async () => {
  const harness = await mountImportBackup({ isConnected: true, type: 'wifi' });

  try {
    assert.equal(harness.apiRef.current!.activeBatchId, null);
    assert.equal(harness.apiRef.current!.importStatus, null);
    assert.equal(harness.apiRef.current!.isUploading, false);
    assert.equal(harness.apiRef.current!.error, null);
    assert.deepEqual(convexOps, []);
  } finally {
    harness.unmount();
  }
});

test('after an import starts, the status renders local queued state with zero Convex reads', async () => {
  const harness = await mountImportBackup({ isConnected: true, type: 'wifi' });

  try {
    // Picking a file is local and works offline.
    setNextDocumentPickerResult(pickConfiguredBackupFile());
    await harness.apiRef.current!.pickBackupFile();
    await settle();
    assert.equal(harness.apiRef.current!.selectedFile?.name, 'backup.sqlite3');

    await harness.apiRef.current!.startBackupImport(
      'http://127.0.0.1:8787',
      'user-1' as never
    );
    await settle();

    // The write path is unchanged: the worker upload plus the
    // startImport mutation ran with the existing input, and the mutation's
    // batch id is still propagated into the active batch.
    assert.equal(uploadCalls.length, 1);
    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0].name, 'startImport');
    assert.equal(harness.apiRef.current!.activeBatchId, 'server-batch');
    assert.equal(harness.apiRef.current!.error, null);
    assert.equal(harness.apiRef.current!.isUploading, false);

    // The status renders from local state: the started import enters the
    // transition rules in their first state, `queued`.
    const status = harness.apiRef.current!.importStatus;
    assert.ok(status, 'the import status must render from local state');
    assert.equal(typeof status.importedAt, 'number');
    assert.deepEqual(
      {
        ...status,
        importedAt: 0,
      },
      {
        batchId: 'server-batch',
        status: 'queued',
        sourceFileName: 'backup.sqlite3',
        fileSize: 1234,
        importedAt: 0,
        completedAt: null,
        errorMessage: null,
        counts: {
          houses: 0,
          leagues: 0,
          weeks: 0,
          sessions: 0,
          balls: 0,
          games: 0,
          frames: 0,
          patterns: 0,
          gamesRefined: 0,
          gamesPatched: 0,
          warnings: 0,
        },
      }
    );

    // Zero Convex reads: the status did not come from a query.
    assert.deepEqual(convexOps, []);
  } finally {
    harness.unmount();
  }
});
