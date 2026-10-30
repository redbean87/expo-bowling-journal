/**
 * C-1d — the hook end to end: a PinPal `.pinpal` backup picked on a device
 * that is offline, has no worker URL configured, and has no signed-in user,
 * restored through the real hook and its state machine into a real journal.
 *
 * The point of the slice is that the journal receives the games, so the
 * suite reads the journal back rather than trusting the hook's own report:
 * the games, the frames each game holds, and the scores the journal computes
 * from those frames. Nothing was uploaded and no Convex mutation ran, so the
 * restored journal is the whole story.
 *
 * The picked file is faked (the legacy file system hands a native picker
 * result as base64); the journal is real, over the same `node:sqlite`-backed
 * `expo-sqlite` double the local-journal suites use, and the fixture is the
 * real export dialect's own bytes.
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
import { createFakeNetInfo, type FakeNetInfoState } from '../harness/fake-env';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

import type { LocalJournalService } from '../../src/services/local-journal/local-journal-service';

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

async function mountImportBackup(initial: FakeNetInfoState): Promise<{
  unmount(): void;
  apiRef: { current: ImportApi | null };
}> {
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

async function settle(rounds = 12): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

function currentApi(apiRef: { current: ImportApi | null }): ImportApi {
  const api = apiRef.current;
  if (api === null) {
    throw new Error('Backup import hook did not mount');
  }

  return api;
}

/** The picker hands over the fixture file, and the fake file system serves it. */
function pickConfiguredBackupFile(
  apiRef: { current: ImportApi | null },
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

  void currentApi(apiRef).pickBackupFile();
}

// --- Tests -----------------------------------------------------------------

test('a PinPal backup offline reaches the journal with no worker and no user', async () => {
  const files = await fixtureFiles();
  const snapshot = fixtureSnapshot();

  const harness = await mountImportBackup({
    isConnected: false,
    type: 'none',
  });

  try {
    pickConfiguredBackupFile(
      harness.apiRef,
      'pinpal-backup.pinpal',
      'file:///pick/pinpal-backup.pinpal',
      files.androidPinpal
    );
    await settle();

    await currentApi(harness.apiRef).startBackupImport('', null);
    await settle();

    const api = currentApi(harness.apiRef);
    assert.equal(api.error, null, 'the import reported no error');
    assert.equal(uploadCalls.length, 0, 'the backup never left the device');
    assert.equal(mutationCalls.length, 0, 'no server import was started');
    assert.equal(api.importStatus?.status, 'completed');
    assert.equal(
      api.importStatus?.batchId,
      null,
      'there was no server batch to poll'
    );

    // The journal, read back through the accessor singleton the hook
    // restored through.
    const localJournal = await import('../../src/services/local-journal');
    const journal: LocalJournalService = localJournal.getLocalJournalService();

    const games = await journal.listGames();
    const sessions = await journal.listSessions();
    const houses = await journal.listHouses();
    const leagues = await journal.listLeagues();

    assert.equal(
      games.length,
      snapshot.games.length,
      'the journal holds every game the image carried'
    );
    assert.equal(
      sessions.length,
      snapshot.sessions.length,
      'the journal holds every session the image carried'
    );
    assert.equal(
      houses.length,
      snapshot.houses.length,
      'the journal holds the house the image carried'
    );
    assert.equal(
      leagues.length,
      snapshot.leagues.length,
      'the journal holds the league the image carried'
    );

    // The scores the journal computes from the restored frames are the
    // scores the image's games were bowled with: frames one to nine are
    // 7-3 spares in every game, so only the tenth frame (and the bonus
    // ball it earns) separates the three.
    const expectedScores: Record<string, number> = {
      strike: 186,
      spare: 167,
      open: 159,
    };

    for (const game of games) {
      const frames = await journal.getGameFrames(game.id);
      assert.equal(
        frames.length,
        10,
        'every frame the image carried came back'
      );

      const score = await journal.getGameScore(game.id);
      assert.notEqual(score, null, 'the journal scored the game');
      assert.equal(
        score?.isComplete,
        true,
        'the restored game is settled, frames and bonus rolls alike'
      );
      assert.equal(
        score?.totalScore,
        expectedScores[game.notes ?? ''],
        'the restored frames score the game the image bowled'
      );
    }

    // The image was opened as a real SQLite database, and the journal
    // opened its own database to write into.
    const openedNames = (globalThis as Record<string, unknown>)[
      '__pinpalImportOpenedDatabaseNames'
    ] as string[];
    assert.ok(
      openedNames.length >= 2,
      'a database was opened for the image and one for the journal'
    );
  } finally {
    harness.unmount();
  }
});
