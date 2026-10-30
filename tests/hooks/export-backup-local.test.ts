/**
 * C-4 T4 (Packet G3, rewritten) — the local export hook and its platform file
 * delivery (`src/hooks/journal/use-export-sqlite-backup.ts`).
 *
 * The hook runs under the plain Node/tsx runner with every un-Node-able
 * import remapped to `./stubs/export-backup-stubs.ts` ('react', 'react-native'
 * with a runtime-configurable `Platform.OS`, `expo-file-system/legacy`,
 * `expo-sharing`, and a SABOTAGED `convex/react` whose `useConvex`/
 * `useConvexAuth` record the attempt and then throw). Real modules run
 * unmodified: `./export-backup/export-filename`, `./export-backup/native-export-file`
 * (the cache-directory + share-sheet boundary), the canonical snapshot reader
 * (`@/services/local-journal/journal-backup-format`), the shared PinPal row
 * converter (`@/services/local-journal/pinpal-backup-rows`), and
 * `@/services/local-journal` — the accessor singleton over the real
 * SQLite-backed service.
 *
 * `expo-sqlite` is remapped to the dialect stub rather than to
 * `tests/db/expo-sqlite-stub.mjs`: the writers serialize the image they build
 * (`SQLiteDatabase.serializeAsync()`), which the journal-only stub cannot do,
 * and the dialect stub implements the same runtime API surface on top of a
 * real `node:sqlite` database, so the journal and the writers run side by
 * side over one seam.
 *
 * Two platform globals are stood up here because the Node runner does not
 * provide them: `FileReader` (the browser / React Native global the blob
 * round trip used to turn the blob into the base64 payload `native-export-file.ts`
 * writes — that boundary now encodes the bytes in JavaScript, so this suite
 * keeps the shim only to leave the platform setup it always had intact) and
 * `document` (the web branch's anchor-download DOM). A third, `confirm`, stands
 * in for the browser prompt the web branch asks when the platform carries no
 * device dialect. Both shims only record what the app asked the platform to do.
 *
 * Covered: Android exports exactly one Android-dialect `.db` file whose bytes
 * are a raw SQLite image; iOS exports exactly one iOS-dialect `.db` file whose
 * bytes are the plist-wrapped compound image; web asks for the dialect and
 * hands exactly one file for the dialect chosen to a browser download with no
 * native write; the version-1 `.json` envelope is no longer the shipped
 * artifact and no journal table ever reaches the file; the export still
 * succeeds with the `convex/react` double sabotaged and no worker URL
 * configured; and a failing file write is surfaced as `exportError` without
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
  'expo-sqlite': path.join(stubDir, 'android-dialect-expo-sqlite-stub.mjs'),
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
        // A device's FileReader base64-encodes the blob's bytes, so the shim
        // does the same: the artifact is binary, not text.
        this.result =
          `data:${blob.type || 'application/octet-stream'};base64,` +
          Buffer.from(await blob.bytes()).toString('base64');

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

// The web branch asks the browser to choose a dialect when the platform
// carries none; this shim answers and records that the prompt was asked.
function installFakeWebConfirm(answer: boolean): { asked: string | null } {
  const prompt: { asked: string | null } = { asked: null };

  installGlobal('confirm', (message: string) => {
    prompt.asked = message;

    return answer;
  });

  return prompt;
}

// --- What the artifact must and must not look like --------------------------

/** The 16 bytes every raw SQLite image starts with. */
const SQLITE_MAGIC = 'SQLite format 3\u0000';

/** Where the iOS compound file's SQLite image starts inside its wrapper. */
const IOS_COMPOUND_SQLITE_OFFSET = 4096;

/** The approved export name, now carrying the `.db` extension. */
const APPROVED_EXPORT_FILE_NAME = /^bowling-journal-\d{4}-\d{2}-\d{2}\.db$/;

/** The table names only the journal has; none may reach the artifact. */
const JOURNAL_ONLY_TABLES = [
  'balls',
  'houses',
  'patterns',
  'leagues',
  'sessions',
  'frames',
];

/** The DDL wording only the journal's own schema uses. */
const JOURNAL_SCHEMA_MARK = 'CREATE TABLE IF NOT EXISTS';

/** The text of the version-1 envelope this app no longer ships. */
const JSON_ENVELOPE_MARK = '{"format":"bowling-journal"';

/** The table only PinPal's Android dialect carries. */
const ANDROID_METADATA_TABLE = 'android_metadata';

/** The opening bytes of the iOS dialect's plist wrapper. */
const IOS_WRAPPER_MARK = '<?xml';

/** One artifact's bytes, decoded from the base64 the platform wrote. */
function exportedBytes(write: { payload: string }): Buffer {
  return Buffer.from(write.payload, 'base64');
}

function textAt(image: Buffer, offset: number, length: number): string {
  return image.slice(offset, offset + length).toString('latin1');
}

function contains(image: Buffer, marker: string): boolean {
  return image.includes(Buffer.from(marker, 'latin1'));
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
  counts: {
    games: number;
    sessions: number;
    frames: number;
  };
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

  // The dialect stub backs each named database with a real file, so a later
  // test's journal already holds the earlier tests' rows. Every test therefore
  // compares against the counts it just built rather than an absolute number.
  const counts = {
    games: (await journal.listGames()).length,
    sessions: (await journal.listSessions()).length,
    frames: (await journal.getGameFrames(game.id)).length,
  };

  return {
    journal,
    counts,
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

// --- Tests ------------------------------------------------------------------

test('android: the export writes one raw SQLite .db image and shares it', async () => {
  const { journal, counts, ids } = await buildFixtureJournal();
  const harness = await mountExport('android');

  try {
    await harness.apiRef.current!.exportSqliteBackup();
    await settle();

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, null);
    assert.equal(api.isExporting, false);
    assert.equal(api.lastExportDialect, 'android');

    const fileName = api.lastExportFileName ?? '';

    assert.notEqual(fileName, '', 'the export reported no delivered file');
    assert.match(fileName, APPROVED_EXPORT_FILE_NAME);
    assert.ok(
      fileName.endsWith('.db'),
      'the artifact does not carry the SQLite extension'
    );
    assert.notEqual(
      fileName.slice(fileName.lastIndexOf('.')),
      '.pinpal',
      'the artifact uses the PinPal app’s own extension'
    );
    assert.notEqual(
      fileName.slice(fileName.lastIndexOf('.')),
      '.json',
      'the artifact is still the JSON envelope'
    );

    // Exactly one write, into the cache directory, under the approved name.
    assert.equal(nativeWrites.length, 1);
    const write = nativeWrites[0];

    assert.equal(write.uri, `${cacheDirectory}${fileName}`);
    assert.equal(write.encoding, 'base64');
    assert.equal(shareCalls.length, 1);
    assert.equal(shareCalls[0].uri, write.uri);

    // The bytes are the Android dialect: a raw SQLite image, not the envelope.
    const image = exportedBytes(write);

    assert.equal(
      textAt(image, 0, SQLITE_MAGIC.length),
      SQLITE_MAGIC,
      'the artifact does not start with the SQLite magic'
    );
    assert.ok(
      contains(image, ANDROID_METADATA_TABLE),
      'the Android dialect has no android_metadata table'
    );
    assert.ok(
      !contains(image, IOS_WRAPPER_MARK),
      'the Android artifact carries the iOS plist wrapper'
    );
    assert.ok(
      !contains(image, JSON_ENVELOPE_MARK),
      'the artifact is still the version-1 JSON envelope'
    );
    assert.ok(
      !contains(image, JOURNAL_SCHEMA_MARK),
      'the artifact is the journal database itself'
    );
    assert.deepStrictEqual(
      JOURNAL_ONLY_TABLES.filter((table) => contains(image, table)),
      [],
      'a journal table reached the artifact'
    );

    // Nothing on the export path reached the sabotaged Convex boundary.
    assert.deepEqual(convexOps, []);

    // And the journal itself is untouched by the export.
    assert.equal((await journal.listGames()).length, counts.games);
    assert.equal((await journal.listSessions()).length, counts.sessions);
    assert.equal((await journal.getGameFrames(ids.game)).length, counts.frames);
  } finally {
    harness.unmount();
  }
});

test('ios: the export writes the plist-wrapped compound .db image', async () => {
  const { journal, counts, ids } = await buildFixtureJournal();
  const harness = await mountExport('ios');

  try {
    await harness.apiRef.current!.exportSqliteBackup();
    await settle();

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, null);
    assert.equal(api.isExporting, false);
    assert.equal(api.lastExportDialect, 'ios');

    const fileName = api.lastExportFileName ?? '';

    assert.match(fileName, APPROVED_EXPORT_FILE_NAME);
    assert.equal(nativeWrites.length, 1);
    assert.equal(shareCalls.length, 1);

    const artifact = exportedBytes(nativeWrites[0]);

    // The compound container: the plist wrapper first, the SQLite image at
    // byte offset 4096, which is what the import detector already reads.
    assert.equal(
      textAt(artifact, 0, IOS_WRAPPER_MARK.length),
      IOS_WRAPPER_MARK,
      'the iOS artifact does not start with its plist wrapper'
    );
    assert.equal(
      textAt(artifact, IOS_COMPOUND_SQLITE_OFFSET, SQLITE_MAGIC.length),
      SQLITE_MAGIC,
      'the iOS image is not at byte offset 4096'
    );
    assert.ok(
      !contains(artifact, ANDROID_METADATA_TABLE),
      'the iOS artifact carries the Android-only metadata table'
    );
    assert.ok(
      !contains(artifact, JSON_ENVELOPE_MARK),
      'the artifact is still the version-1 JSON envelope'
    );
    assert.ok(
      !contains(artifact, JOURNAL_SCHEMA_MARK),
      'the artifact is the journal database itself'
    );
    assert.deepStrictEqual(
      JOURNAL_ONLY_TABLES.filter((table) => contains(artifact, table)),
      [],
      'a journal table reached the artifact'
    );

    assert.deepEqual(convexOps, []);
    assert.equal((await journal.listGames()).length, counts.games);
    assert.equal((await journal.listSessions()).length, counts.sessions);
    assert.equal((await journal.getGameFrames(ids.game)).length, counts.frames);
  } finally {
    harness.unmount();
  }
});

test('the export succeeds with Convex sabotaged and no worker URL configured', async () => {
  const { journal, ids } = await buildFixtureJournal();

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
    assert.match(api.lastExportFileName ?? '', APPROVED_EXPORT_FILE_NAME);
    assert.equal(api.lastExportDialect, 'android');
    assert.equal(nativeWrites.length, 1);
    assert.equal(shareCalls.length, 1);
    assert.deepEqual(convexOps, []);
    assert.ok(
      (await journal.listGames()).some((game) => {
        return game.id === ids.game;
      }),
      'the export lost the fixture game'
    );
  } finally {
    harness.unmount();
  }
});

test('web: the dialect the user picks decides one download and no native file', async () => {
  const { journal, counts } = await buildFixtureJournal();
  const harness = await mountExport('web');
  const downloads = installFakeWebDocument();
  const prompt = installFakeWebConfirm(true);

  try {
    await harness.apiRef.current!.exportSqliteBackup();
    await settle();

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, null);
    assert.ok(
      prompt.asked !== null,
      'web asked no dialect choice before writing a file'
    );
    assert.equal(api.lastExportDialect, 'android');
    assert.equal(nativeWrites.length, 0);
    assert.equal(shareCalls.length, 0);
    assert.equal(
      downloads.length,
      1,
      'web delivered more or less than one file'
    );
    assert.match(downloads[0].download, APPROVED_EXPORT_FILE_NAME);
    assert.equal(api.lastExportFileName, downloads[0].download);
    assert.equal((await journal.listGames()).length, counts.games);
  } finally {
    installGlobal('document', null);
    installGlobal('confirm', null);
    harness.unmount();
  }
});

test('web: the other dialect choice writes the compound file instead', async () => {
  const { journal, counts } = await buildFixtureJournal();
  const harness = await mountExport('web');
  const downloads = installFakeWebDocument();
  const prompt = installFakeWebConfirm(false);

  try {
    await harness.apiRef.current!.exportSqliteBackup();
    await settle();

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, null);
    assert.ok(
      prompt.asked !== null,
      'web asked no dialect choice before writing a file'
    );
    assert.equal(api.lastExportDialect, 'ios');
    assert.equal(nativeWrites.length, 0);
    assert.equal(downloads.length, 1);
    assert.equal(api.lastExportFileName, downloads[0].download);
    assert.equal((await journal.listSessions()).length, counts.sessions);
  } finally {
    installGlobal('document', null);
    installGlobal('confirm', null);
    harness.unmount();
  }
});

test('a failed file write is surfaced and no exported file is reported', async () => {
  const { journal, counts, ids } = await buildFixtureJournal();

  const harness = await mountExport('android');

  setNativeWriteFailure('Native file system is unavailable.');

  try {
    await harness.apiRef.current!.exportSqliteBackup();
    await settle();

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, 'Native file system is unavailable.');
    assert.equal(api.isExporting, false);
    assert.equal(api.lastExportFileName, null);
    assert.equal(api.lastExportDialect, null);
    assert.equal(nativeWrites.length, 0);
    assert.equal(shareCalls.length, 0);

    // The journal is still fully intact after the failed export.
    assert.equal((await journal.listGames()).length, counts.games);
    assert.equal((await journal.listSessions()).length, counts.sessions);
    assert.equal((await journal.getGameFrames(ids.game)).length, counts.frames);
  } finally {
    harness.unmount();
  }
});
