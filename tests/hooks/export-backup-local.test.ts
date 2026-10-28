/**
 * C-4 T3 (Packet G3) — the local export hook and its platform file delivery
 * (`src/hooks/journal/use-export-sqlite-backup.ts`).
 *
 * The hook runs under the plain Node/tsx runner with every un-Node-able
 * import remapped to `./stubs/export-backup-stubs.ts` ('react', 'react-native'
 * with a runtime-configurable `Platform.OS`, `expo-file-system/legacy`,
 * `expo-sharing`, and a SABOTAGED `convex/react` whose `useConvex`/
 * `useConvexAuth` record the attempt and then throw). Real modules run
 * unmodified: `./export-backup/export-filename`, `./export-backup/native-export-file`
 * (the cache-directory + share-sheet boundary), the C-4 G1/G2 serializer
 * (`@/services/local-journal/journal-backup-format`), and
 * `@/services/local-journal` — the accessor singleton over the real
 * SQLite-backed service, whose `expo-sqlite` dependency is remapped to the
 * shared `tests/db/expo-sqlite-stub.mjs` in-memory database.
 *
 * Two platform globals the delivery boundary relies on are stood up here
 * because the Node runner does not provide them: `FileReader` (the browser /
 * React Native global `native-export-file.ts` uses to turn the blob into the
 * base64 payload it writes) and `document` (the web branch's anchor-download
 * DOM). Both shims only record what the app asked the platform to do.
 *
 * Covered: the native branch writes the version-1 `.json` envelope into
 * `FileSystem.cacheDirectory` under the approved name and hands that exact
 * file to the share sheet; the export still succeeds with the `convex/react`
 * double sabotaged and no worker URL configured or passed (audit A1, A2, A18);
 * the web branch hands the same bytes to a browser download and writes no
 * native file; and a failing file write is surfaced as `exportError` without
 * reporting a delivered file. In every case the journal itself is untouched.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  __setActiveRenderer,
  cacheDirectory,
  convexOps,
  nativeWrites,
  resetExportBackupStubs,
  setNativeWriteFailure,
  setPlatformOS,
  shareCalls,
} from './stubs/export-backup-stubs';
import {
  JOURNAL_BACKUP_FILE_EXTENSION,
  JOURNAL_BACKUP_FORMAT,
  JOURNAL_BACKUP_VERSION,
} from '../../src/services/local-journal/journal-backup-format';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

const stubDir = path.join(__dirname, 'stubs');
const stubPath = path.join(stubDir, 'export-backup-stubs.ts');
const stubRewrites: Record<string, string> = {
  react: stubPath,
  'convex/react': stubPath,
  'react-native': stubPath,
  'expo-file-system/legacy': stubPath,
  'expo-sharing': stubPath,
  'expo-sqlite': path.join(__dirname, '..', 'db', 'expo-sqlite-stub.mjs'),
};

const hookHandle = registerStubRemaps(() => stubRewrites);

after(() => {
  hookHandle.deregister();
});

type ExportModule =
  typeof import('../../src/hooks/journal/use-export-sqlite-backup');
type ExportApi = ReturnType<ExportModule['useExportSqliteBackup']>;
type DatabaseModule = typeof import('../../src/db/database');
type ServiceModule =
  typeof import('../../src/services/local-journal/sqlite-local-journal-service');
type Journal = InstanceType<ServiceModule['SqliteLocalJournalService']>;

let exportModulePromise: Promise<ExportModule> | null = null;

// Dynamic import so the stub remaps registered above are in effect when the
// hook resolves its own imports.
function getExportModule(): Promise<ExportModule> {
  exportModulePromise ??=
    import('../../src/hooks/journal/use-export-sqlite-backup');

  return exportModulePromise;
}

// --- Platform globals the delivery boundary expects -------------------------

class FakeFileReader {
  result: null | string | ArrayBuffer = null;
  onerror: (() => void) | null = null;
  onloadend: (() => void) | null = null;

  readAsDataURL(blob: Blob): void {
    void (async () => {
      try {
        const text = await blob.text();

        this.result =
          `data:${blob.type || 'application/octet-stream'};base64,` +
          Buffer.from(text).toString('base64');

        const onloadend = this.onloadend;

        if (onloadend) {
          setTimeout(onloadend, 0);
        }
      } catch {
        const onerror = this.onerror;

        if (onerror) {
          setTimeout(onerror, 0);
        }
      }
    })();
  }
}

// The Node runner has no DOM, and the app's `document`/`FileReader` globals
// carry the DOM types the expo tsconfig pulls in, so the shims below are
// installed through an erased view of the global object: the hook reads these
// names at call time, which is what a browser or React Native would provide.
function installGlobal(name: string, value: unknown): void {
  const globals: Record<string, unknown> = globalThis as unknown as Record<
    string,
    unknown
  >;

  globals[name] = value;
}

installGlobal('FileReader', FakeFileReader);

type FakeAnchor = {
  href: string;
  download: string;
  click(): void;
  remove(): void;
};

// The web branch builds an `<a download>` and clicks it; this shim records the
// name and object URL the app handed to the browser.
function installFakeWebDocument(): Array<{ href: string; download: string }> {
  const downloads: Array<{ href: string; download: string }> = [];

  installGlobal('document', {
    createElement: (_tag: string) => {
      const anchor: FakeAnchor = {
        href: '',
        download: '',
        remove: (): void => {},
        click: (): void => {},
      };

      anchor.click = (): void => {
        downloads.push({ href: anchor.href, download: anchor.download });
      };

      return anchor;
    },
    body: {
      append: (_child: unknown): void => {},
    },
  });

  return downloads;
}

// --- Test harness -----------------------------------------------------------

async function mountExport(os: string): Promise<{
  apiRef: { current: ExportApi | null };
  unmount(): void;
}> {
  resetExportBackupStubs();
  setPlatformOS(os);

  const { useExportSqliteBackup } = await getExportModule();

  const apiRef: { current: ExportApi | null } = { current: null };

  const renderer = new MiniReact(() => {
    apiRef.current = useExportSqliteBackup();

    return null;
  }, __setActiveRenderer);
  renderer.mount();

  if (apiRef.current === null) {
    throw new Error('Export hook did not mount');
  }

  return {
    apiRef,
    unmount(): void {
      renderer.unmount();
    },
  };
}

async function settle(rounds = 24): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

// A fresh in-memory journal holding one house, ball, pattern, league, a
// league session, an open session, one game, and three frames - frame 1,
// frame 2, and the tenth-numbered frame carrying all three roll masks -
// built through the real service.
async function buildFixtureJournal(): Promise<{
  journal: Journal;
  ids: {
    house: string;
    ball: string;
    pattern: string;
    league: string;
    session: string;
    game: string;
  };
}> {
  const dbModule: DatabaseModule = await import('../../src/db/database');

  await dbModule.closeDatabase();

  const serviceModule: ServiceModule =
    await import('../../src/services/local-journal/sqlite-local-journal-service');

  await dbModule.getDatabase();

  const journal = new serviceModule.SqliteLocalJournalService();

  const house = await journal.createHouse({ name: 'Test House' });
  const ball = await journal.createBall({ name: 'Zen 25' });
  const pattern = await journal.createPattern({ name: 'Cheetah', length: 41 });
  const league = await journal.createLeague({
    name: 'Thursday Night',
    gamesPerSession: 3,
    houseId: house.id,
    houseName: 'Test House',
    startDate: '2026-03-08',
    endDate: '2026-03-29',
  });
  const session = await journal.createSession({
    leagueId: league.id,
    date: '2026-03-15',
    weekNumber: 2,
    houseId: house.id,
    ballId: ball.id,
    patternId: pattern.id,
  });
  await journal.createSession({ leagueId: null, date: '2026-03-14' });
  const game = await journal.createGame({
    sessionId: session.id,
    date: '2026-03-15',
    houseId: house.id,
    ballId: ball.id,
    patternId: pattern.id,
  });
  await journal.replaceGameFrames(game.id, [
    { frameNumber: 1, roll1Mask: 0b1111111111 },
    { frameNumber: 2, roll1Mask: 0b0000001111, roll2Mask: 0b1111000000 },
    {
      frameNumber: 10,
      roll1Mask: 0b1111111111,
      roll2Mask: 0b0000000111,
      roll3Mask: 0b1000000000,
    },
  ]);

  return {
    journal,
    ids: {
      house: house.id,
      ball: ball.id,
      pattern: pattern.id,
      league: league.id,
      session: session.id,
      game: game.id,
    },
  };
}

type BackupRow = {
  id: string;
  gameId?: string | null;
  frameNumber?: number;
  roll1Mask?: number | null;
  roll2Mask?: number | null;
  roll3Mask?: number | null;
};

type ParsedBackupDocument = {
  format: string;
  version: number;
  exportedAt: string;
  data: {
    balls: BackupRow[];
    houses: BackupRow[];
    patterns: BackupRow[];
    leagues: BackupRow[];
    sessions: BackupRow[];
    games: BackupRow[];
    frames: BackupRow[];
  };
};

/** The exported artifact's bytes, decoded from the base64 the platform wrote. */
type NativeWrite = {
  uri: string;
  encoding: string | null;
  payload: string;
};

/** The exported artifact's bytes, decoded from the base64 the platform wrote. */
function exportedDocument(write: NativeWrite): ParsedBackupDocument {
  const json = Buffer.from(write.payload, 'base64').toString('utf8');

  return JSON.parse(json) as unknown as ParsedBackupDocument;
}

const APPROVED_EXPORT_FILE_NAME = /^bowling-journal-\d{4}-\d{2}-\d{2}\.json$/;

// --- Tests ------------------------------------------------------------------

test('native: the export writes the versioned .json artifact and shares it', async () => {
  const { journal, ids } = await buildFixtureJournal();
  const harness = await mountExport('android');

  try {
    await harness.apiRef.current!.exportSqliteBackup();
    await settle();

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, null);
    assert.equal(api.isExporting, false);

    const fileName = api.lastExportFileName ?? '';

    assert.notEqual(fileName, '', 'the export reported no delivered file');
    assert.match(fileName, APPROVED_EXPORT_FILE_NAME);
    assert.ok(
      fileName.endsWith(JOURNAL_BACKUP_FILE_EXTENSION),
      'the artifact is not a .json document'
    );
    assert.notEqual(
      fileName.slice(fileName.lastIndexOf('.')),
      '.pinpal',
      'the artifact uses the PinPal extension'
    );

    // Exactly one write, into the cache directory, under the approved name.
    assert.equal(nativeWrites.length, 1);
    const write = nativeWrites[0];

    assert.equal(write.uri, `${cacheDirectory}${fileName}`);
    assert.equal(write.encoding, 'base64');
    assert.equal(shareCalls.length, 1);
    assert.equal(shareCalls[0].uri, write.uri);

    // The bytes are the version-1 envelope over the local journal.
    const document = exportedDocument(write);

    assert.equal(document.format, JOURNAL_BACKUP_FORMAT);
    assert.notEqual(document.format, 'pinpal');
    assert.equal(document.version, JOURNAL_BACKUP_VERSION);
    assert.match(
      document.exportedAt,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    assert.deepEqual(Object.keys(document.data), [
      'balls',
      'houses',
      'patterns',
      'leagues',
      'sessions',
      'games',
      'frames',
    ]);
    assert.deepEqual(
      document.data.balls.map((row) => row.id),
      [ids.ball]
    );
    assert.deepEqual(
      document.data.houses.map((row) => row.id),
      [ids.house]
    );
    assert.deepEqual(
      document.data.patterns.map((row) => row.id),
      [ids.pattern]
    );
    assert.deepEqual(
      document.data.leagues.map((row) => row.id),
      [ids.league]
    );
    assert.deepEqual(
      document.data.games.map((row) => row.id),
      [ids.game]
    );
    assert.equal(document.data.sessions.length, 2);
    assert.equal(document.data.frames.length, 3);
    assert.ok(
      document.data.frames.every((frame) => frame.gameId === ids.game),
      'a frame belongs to another game'
    );
    assert.ok(
      document.data.frames.some(
        (frame) => frame.frameNumber === 10 && frame.roll3Mask === 0b1000000000
      ),
      'the tenth frame does not carry its third-roll mask'
    );

    // Nothing on the export path reached the sabotaged Convex boundary.
    assert.deepEqual(convexOps, []);

    // And the journal itself is untouched by the export.
    assert.equal((await journal.listGames()).length, 1);
    assert.equal((await journal.listSessions()).length, 2);
    assert.equal((await journal.getGameFrames(ids.game)).length, 3);
  } finally {
    harness.unmount();
  }
});

test('the export succeeds with Convex sabotaged and no worker URL configured', async () => {
  const { journal } = await buildFixtureJournal();

  // Arm the sabotage: the module the export used to open with is present and
  // throws on contact.
  const sabotagedConvex = await import('convex/react');
  let convexContactRejected = false;

  try {
    sabotagedConvex.useConvex();
  } catch {
    convexContactRejected = true;
  }

  assert.ok(
    convexContactRejected,
    'the sabotaged Convex double did not throw on contact'
  );
  assert.deepEqual(convexOps, [{ kind: 'useConvex' }]);
  convexOps.length = 0;

  const harness = await mountExport('android');

  try {
    // No worker base URL exists in this suite at all, and the hook takes no
    // argument to carry one.
    await harness.apiRef.current!.exportSqliteBackup();
    await settle();

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, null);
    assert.match(
      api.lastExportFileName ?? '',
      APPROVED_EXPORT_FILE_NAME,
      'no .json artifact was delivered'
    );
    assert.equal(nativeWrites.length, 1);
    assert.equal(shareCalls.length, 1);
    assert.deepEqual(convexOps, []);
    assert.equal((await journal.listGames()).length, 1);
  } finally {
    harness.unmount();
  }
});

test('web: the same bytes go to a browser download and no native file is written', async () => {
  const { journal } = await buildFixtureJournal();
  const harness = await mountExport('web');
  const downloads = installFakeWebDocument();

  try {
    await harness.apiRef.current!.exportSqliteBackup();
    await settle();

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, null);
    assert.equal(nativeWrites.length, 0);
    assert.equal(shareCalls.length, 0);
    assert.equal(downloads.length, 1);
    assert.match(downloads[0].download, APPROVED_EXPORT_FILE_NAME);
    assert.equal(api.lastExportFileName, downloads[0].download);
    assert.equal((await journal.listGames()).length, 1);
  } finally {
    installGlobal('document', null);
    harness.unmount();
  }
});

test('a failed file write is surfaced and no exported file is reported', async () => {
  const { journal, ids } = await buildFixtureJournal();

  const harness = await mountExport('android');

  setNativeWriteFailure('Native file system is unavailable.');

  try {
    await harness.apiRef.current!.exportSqliteBackup();
    await settle();

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, 'Native file system is unavailable.');
    assert.equal(api.isExporting, false);
    assert.equal(api.lastExportFileName, null);
    assert.equal(nativeWrites.length, 0);
    assert.equal(shareCalls.length, 0);

    // The journal is still fully intact after the failed export.
    assert.equal((await journal.listGames()).length, 1);
    assert.equal((await journal.listSessions()).length, 2);
    assert.equal((await journal.getGameFrames(ids.game)).length, 3);
  } finally {
    harness.unmount();
  }
});
