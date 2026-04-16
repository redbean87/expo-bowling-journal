import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildImportingSnapshotJsonCallbackPayload } from '../../worker/src/callback_payload.js';
import { parseBackupDatabaseToSnapshot } from '../../worker/src/sqlite_parser.js';

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function loadSqlWasmModule() {
  const wasmPath = resolve(
    process.cwd(),
    'worker',
    'node_modules',
    'sql.js',
    'dist',
    'sql-wasm.wasm'
  );
  const wasmBytes = await readFile(wasmPath);
  return new WebAssembly.Module(toArrayBuffer(wasmBytes));
}

const dbPath = resolve(process.cwd(), 'Backup(TJ).pinpal');
const fixturePresent = existsSync(dbPath);

test(
  'Backup(TJ).pinpal - PinPal Lite compound format detection and parsing',
  {
    skip: fixturePresent
      ? false
      : 'Backup(TJ).pinpal fixture not present at repo root',
  },
  async () => {
    const dbBytes = await readFile(dbPath);
    console.log(`File size: ${dbBytes.length} bytes`);

    // Verify it's a compound format (not SQLite at offset 0)
    const headerAtZero = dbBytes.toString('ascii', 0, 16);
    console.log('Header at offset 0:', headerAtZero.substring(0, 50));

    // Should be XML/plist, not SQLite
    assert.equal(
      headerAtZero.startsWith('<?xml'),
      true,
      'File should start with XML plist header (compound format)'
    );

    // Verify SQLite header at offset 4096
    const headerAt4096 = dbBytes.toString('ascii', 4096, 4112);
    console.log('Header at offset 4096:', headerAt4096.substring(0, 20));

    assert.equal(
      headerAt4096.startsWith('SQLite format 3'),
      true,
      'SQLite header should be at offset 4096'
    );

    // Now parse with offset
    const wasmModule = await loadSqlWasmModule();

    const parsedSnapshot = await parseBackupDatabaseToSnapshot(
      toArrayBuffer(dbBytes),
      {
        sourceFileName: 'Backup(TJ).pinpal',
        sourceHash: null,
        wasmModule,
        sqliteOffset: 4096,
      }
    );

    console.log('Parser version:', parsedSnapshot.parserVersion);
    console.log('Is compound format:', parsedSnapshot.isCompoundFormat);
    console.log('SQLite offset:', parsedSnapshot.sqliteOffset);

    // Verify compound format is detected
    assert.equal(parsedSnapshot.isCompoundFormat, true);
    assert.equal(parsedSnapshot.sqliteOffset, 4096);

    // Log data counts
    console.log('Houses:', parsedSnapshot.snapshot.houses.length);
    console.log('Patterns:', parsedSnapshot.snapshot.patterns.length);
    console.log('Balls:', parsedSnapshot.snapshot.balls.length);
    console.log('Leagues:', parsedSnapshot.snapshot.leagues.length);
    console.log('Weeks:', parsedSnapshot.snapshot.weeks.length);
    console.log('Games:', parsedSnapshot.snapshot.games.length);
    console.log('Frames:', parsedSnapshot.snapshot.frames.length);

    // Build callback payload to verify snapshotJson transport works
    const callbackPayload = buildImportingSnapshotJsonCallbackPayload(
      'test_batch_tj_123',
      parsedSnapshot,
      null,
      'pinpal-lite-compound'
    );

    assert.equal(callbackPayload.stage, 'importing');
    assert.equal(typeof callbackPayload.snapshotJson, 'string');
    assert.equal(callbackPayload.detectedFormat, 'pinpal-lite-compound');
    assert.equal('snapshot' in callbackPayload, false);

    const decodedSnapshot = JSON.parse(callbackPayload.snapshotJson);
    assert.equal(
      decodedSnapshot.frames.length,
      parsedSnapshot.snapshot.frames.length
    );

    console.log(
      `\n✓ SUCCESS: Backup(TJ).pinpal parsed successfully as PinPal Lite compound format`
    );
    console.log(`✓ Detected format: pinpal-lite-compound`);
    console.log(`✓ SQLite offset: 4096 bytes`);
    console.log(`✓ Data extracted and ready for import`);
  }
);
