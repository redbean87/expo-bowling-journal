import assert from 'node:assert/strict';
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

test('Backup.pinpal parse path handles expected large frame count and callback transport uses snapshotJson', async () => {
  const dbPath = resolve(process.cwd(), 'Backup.pinpal');
  const dbBytes = await readFile(dbPath);
  const wasmModule = await loadSqlWasmModule();

  const parsedSnapshot = await parseBackupDatabaseToSnapshot(
    toArrayBuffer(dbBytes),
    {
      sourceFileName: 'Backup.pinpal',
      sourceHash: null,
      wasmModule,
    }
  );

  assert.equal(parsedSnapshot.snapshot.frames.length, 16476);

  const callbackPayload = buildImportingSnapshotJsonCallbackPayload(
    'test_batch_12345678',
    parsedSnapshot
  );

  assert.equal(callbackPayload.stage, 'importing');
  assert.equal(typeof callbackPayload.snapshotJson, 'string');
  assert.equal('snapshot' in callbackPayload, false);

  const decodedSnapshot = JSON.parse(callbackPayload.snapshotJson);
  assert.equal(decodedSnapshot.frames.length, 16476);
  assert.equal(callbackPayload.snapshotJson.length > 100_000, true);
});
