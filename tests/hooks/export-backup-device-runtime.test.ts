/**
 * C-4 T4 device runtime — the export on a runtime whose `Blob` refuses bytes.
 *
 * This is the captain's scenario, one side over the import suite that found
 * the same root cause: the hook builds the dialect image, then hands it to the
 * platform. On a phone that hand-off cannot go through a `Blob` — React Native's
 * `Blob`, the polyfill `@expo/metro-runtime` installs, throws
 * "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"
 * the moment the image is wrapped, so the export dies before a single byte
 * reaches the cache directory. Node's global `Blob` accepts those parts, which
 * is why the plain export suite stays green while the device fails.
 *
 * The harness is the plain export suite's (same stub doubles, same dialect
 * `expo-sqlite` double, same real writers and real journal service); what this
 * suite adds is the device simulation, so an export that only works because
 * Node happens to have a permissive `Blob` fails here.
 *
 * `FileReader` is deliberately NOT stood up here, unlike the plain suite: the
 * native path has no reason to reach it any more, so a delivery boundary that
 * still routes the image through the blob/data-URL round trip fails this suite
 * twice over — once at the hostile `Blob`, once at the missing global.
 *
 * Covered: the delivery boundary base64-encodes an arbitrary byte vector
 * (every byte value, and all three tail lengths) under the hostile `Blob`
 * without constructing one; Android exports exactly one raw SQLite `.db` and
 * shares it on that runtime; iOS exports exactly one plist-wrapped compound
 * `.db` on it too; and neither device export reports an error or writes a
 * second file.
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
  setPlatformOS,
  shareCalls,
} from './stubs/export-backup-stubs';
import { withDeviceBlob } from '../harness/device-runtime-globals';
import { MiniReact } from '../harness/mini-hook-renderer';
import { registerStubRemaps } from '../harness/remap';

type ExportModule =
  typeof import('../../src/hooks/journal/use-export-sqlite-backup');
type ExportApi = ReturnType<ExportModule['useExportSqliteBackup']>;
type DeliveryModule =
  typeof import('../../src/hooks/journal/export-backup/native-export-file');
type DatabaseModule = typeof import('../../src/db/database');
type ServiceModule =
  typeof import('../../src/services/local-journal/sqlite-local-journal-service');
type Journal = InstanceType<ServiceModule['SqliteLocalJournalService']>;

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

// --- The artifact's shape ---------------------------------------------------

/** The 16 bytes every raw SQLite image starts with. */
const SQLITE_MAGIC = 'SQLite format 3\u0000';

/** Where the iOS compound file's SQLite image starts inside its wrapper. */
const IOS_COMPOUND_SQLITE_OFFSET = 4096;

/** The approved export name, carrying the `.db` extension. */
const APPROVED_EXPORT_FILE_NAME = /^bowling-journal-\d{4}-\d{2}-\d{2}\.db$/;

/** The table only PinPal's Android dialect carries. */
const ANDROID_METADATA_TABLE = 'android_metadata';

/** The opening bytes of the iOS dialect's plist wrapper. */
const IOS_WRAPPER_MARK = '<?xml';

/** The text of the version-1 envelope this app no longer ships. */
const JSON_ENVELOPE_MARK = '{"format":"bowling-journal"';

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

let exportModulePromise: Promise<ExportModule> | null = null;

// Dynamic import so the stub remaps registered above are in effect when the
// hook resolves its own imports.
function getExportModule(): Promise<ExportModule> {
  exportModulePromise ??=
    import('../../src/hooks/journal/use-export-sqlite-backup');

  return exportModulePromise;
}

// A small in-memory journal — one house, ball, pattern, league, session, game,
// and three frames — built through the real service, with the counts it just
// built so a later test in this file can compare against what it created rather
// than an absolute total (the dialect stub backs each named database with a
// real file that keeps earlier tests' rows).
async function buildFixtureJournal(): Promise<{
  journal: Journal;
  counts: { games: number; sessions: number };
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
    counts: {
      games: (await journal.listGames()).length,
      sessions: (await journal.listSessions()).length,
    },
  };
}

// --- Tests ------------------------------------------------------------------

test('the boundary base64-encodes bytes without building a Blob on that runtime', async () => {
  // Every byte value, plus each of the three tail lengths base64 pads for.
  const bytes = new Uint8Array(258);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = index % 256;
  }

  const deliveryModule: DeliveryModule =
    await import('../../src/hooks/journal/export-backup/native-export-file');

  await withDeviceBlob(async () => {
    await deliveryModule.saveAndShareNativeBackupFile(bytes, 'bytes.db');
  });

  assert.equal(nativeWrites.length, 1, 'the boundary wrote no file');
  assert.equal(shareCalls.length, 1, 'the share sheet was never opened');

  const write = nativeWrites[0];

  assert.equal(write.uri, `${cacheDirectory}bytes.db`);
  assert.equal(write.encoding, 'base64');
  assert.equal(
    write.payload,
    Buffer.from(bytes).toString('base64'),
    'the JavaScript encoder disagrees with the platform’s base64'
  );
  assert.deepStrictEqual(
    exportedBytes(write),
    Buffer.from(bytes),
    'the written payload is not the image bytes'
  );
  assert.deepEqual(shareCalls[0].options, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Export SQLite backup',
  });
});

test('android: the export writes its .db under React Native’s hostile Blob', async () => {
  const { journal, counts } = await buildFixtureJournal();
  const harness = await mountExport('android');

  try {
    await withDeviceBlob(async () => {
      await harness.apiRef.current!.exportSqliteBackup();
      await settle();
    });

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, null, 'the device runtime failed the export');
    assert.equal(api.isExporting, false);
    assert.equal(api.lastExportDialect, 'android');

    const fileName = api.lastExportFileName ?? '';

    assert.match(fileName, APPROVED_EXPORT_FILE_NAME);

    assert.equal(nativeWrites.length, 1, 'the device wrote more than one file');
    assert.equal(shareCalls.length, 1, 'the share sheet never opened');

    const write = nativeWrites[0];

    assert.equal(write.uri, `${cacheDirectory}${fileName}`);
    assert.equal(write.encoding, 'base64');
    assert.equal(shareCalls[0].uri, write.uri);

    const image = exportedBytes(write);

    assert.equal(
      textAt(image, 0, SQLITE_MAGIC.length),
      SQLITE_MAGIC,
      'the artifact does not start with the SQLite magic'
    );
    assert.ok(
      !contains(image, JSON_ENVELOPE_MARK),
      'the artifact is still the version-1 JSON envelope'
    );
    assert.ok(
      contains(image, ANDROID_METADATA_TABLE),
      'the Android dialect has no android_metadata table'
    );
    assert.ok(
      !contains(image, IOS_WRAPPER_MARK),
      'the Android artifact carries the iOS plist wrapper'
    );
    assert.deepEqual(convexOps, []);

    assert.equal(
      (await journal.listGames()).length,
      counts.games,
      'the export lost the fixture game'
    );
    assert.equal(
      (await journal.listSessions()).length,
      counts.sessions,
      'the export lost the fixture session'
    );
  } finally {
    harness.unmount();
  }
});

test('ios: the compound .db is written on that runtime too', async () => {
  const { journal, counts } = await buildFixtureJournal();
  const harness = await mountExport('ios');

  try {
    await withDeviceBlob(async () => {
      await harness.apiRef.current!.exportSqliteBackup();
      await settle();
    });

    const api = harness.apiRef.current!;

    assert.equal(api.exportError, null, 'the device runtime failed the export');
    assert.equal(api.lastExportDialect, 'ios');

    const fileName = api.lastExportFileName ?? '';

    assert.match(fileName, APPROVED_EXPORT_FILE_NAME);
    assert.equal(nativeWrites.length, 1);
    assert.equal(shareCalls.length, 1);

    const write = nativeWrites[0];

    assert.equal(write.uri, `${cacheDirectory}${fileName}`);
    assert.equal(write.encoding, 'base64');

    const artifact = exportedBytes(write);

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
    assert.deepEqual(convexOps, []);

    assert.equal(
      (await journal.listGames()).length,
      counts.games,
      'the export lost the fixture game'
    );
    assert.equal(
      (await journal.listSessions()).length,
      counts.sessions,
      'the export lost the fixture session'
    );
  } finally {
    harness.unmount();
  }
});
