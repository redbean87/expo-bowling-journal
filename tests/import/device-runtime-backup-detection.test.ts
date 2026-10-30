/**
 * Format detection on a device runtime whose `Blob` cannot be built from bytes.
 *
 * React Native's `Blob` — the polyfill `@expo/metro-runtime` installs —
 * refuses `ArrayBuffer` and `ArrayBufferView` parts ("Creating blobs from
 * 'ArrayBuffer' and 'ArrayBufferView' are not supported"), so the import hook
 * cannot wrap the bytes it read from the picked file the way the web path
 * wraps a picked file. The suite installs that same refusal and drives the
 * sniff over the bytes directly, plus the unchanged `Blob` path the upload
 * still uses:
 *
 *   - the device's `Blob` constructor genuinely rejects the bytes, so the
 *     constraint is pinned rather than assumed;
 *   - the bytes decide the format — raw SQLite, the iOS compound container,
 *     this app's JSON envelope, and bytes that are not a backup at all;
 *   - the same content decides identically through the bytes and through the
 *     `Blob`, down to the actionable errors a malformed envelope reports;
 *   - the upload path's own entry points keep working under the hostile `Blob`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  detectBackupFormat,
  isSupportedBackupBlob,
  validateBackupBlob,
  validateBackupBytes,
} from '../../src/hooks/journal/import-backup/file-validation';
import {
  JOURNAL_BACKUP_FORMAT,
  JOURNAL_BACKUP_VERSION,
} from '../../src/services/local-journal/journal-backup-format';
import { withDeviceBlob } from '../harness/device-runtime-globals';

const SQLITE_MAGIC = 'SQLite format 3\u0000';
const SQLITE_COMPOUND_OFFSET = 4096;

/** A raw SQLite image: the Android dialect's `.db`. */
function sqliteImageText(): string {
  return `${SQLITE_MAGIC}${'padding'.repeat(64)}`;
}

/** The iOS dialect's container: a plist, padding, then SQLite at offset 4096. */
function compoundFileText(): string {
  const plist =
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist><dict/></plist>\n';
  const image = sqliteImageText();

  return `${plist}${'0'.repeat(SQLITE_COMPOUND_OFFSET - plist.length)}${image}`;
}

/** This app's own JSON envelope — the format the local restore cannot handle. */
function journalEnvelopeText(): string {
  return JSON.stringify({
    format: JOURNAL_BACKUP_FORMAT,
    version: JOURNAL_BACKUP_VERSION,
    exportedAt: '2026-10-28T13:58:00.000Z',
    data: { houses: [], leagues: [], games: [], frames: [] },
  });
}

/** Bytes that are not a backup at all. */
function notABackupText(): string {
  return 'a note about bowling nights, not a backup file';
}

/** A file that opens like JSON but stops before the envelope is readable. */
function malformedEnvelopeText(): string {
  return '{"format": "bowling-journal", ';
}

/** The bytes a device hands the sniff: the picked file's content, decoded. */
function pickedBytes(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

const fixtures = [
  sqliteImageText(),
  compoundFileText(),
  journalEnvelopeText(),
  notABackupText(),
  malformedEnvelopeText(),
];

test('the device Blob refuses the bytes the picker hands over', async () => {
  await withDeviceBlob(async () => {
    assert.throws(
      () =>
        new Blob([pickedBytes(sqliteImageText())], {
          type: 'application/octet-stream',
        }),
      /ArrayBuffer/
    );
    assert.throws(
      () => new Blob([pickedBytes(journalEnvelopeText())]),
      /ArrayBufferView|ArrayBuffer/
    );

    assert.equal(
      new Blob([sqliteImageText()]).size,
      sqliteImageText().length,
      'a Blob built from text is still a Blob'
    );
  });
});

test('the bytes decide the format with no Blob anywhere in sight', async () => {
  await withDeviceBlob(async () => {
    assert.equal(
      await detectBackupFormat(pickedBytes(sqliteImageText())),
      'pinpal-sqlite'
    );
    assert.equal(
      await detectBackupFormat(pickedBytes(compoundFileText())),
      'pinpal-lite-compound'
    );
    assert.equal(
      await detectBackupFormat(pickedBytes(journalEnvelopeText())),
      'journal-json'
    );
    assert.equal(await detectBackupFormat(pickedBytes(notABackupText())), null);
    assert.equal(await detectBackupFormat(new Uint8Array()), null);
  });
});

test('the same content decides identically from bytes and from a Blob', async () => {
  await withDeviceBlob(async () => {
    for (const text of fixtures) {
      const fromBytes = await validateBackupBytes(pickedBytes(text));
      const fromBlob = await validateBackupBlob(new Blob([text]));

      assert.deepEqual(
        fromBytes,
        fromBlob,
        'a file decides the same way on the device as in the upload path, ' +
          'down to the message it is rejected with'
      );
    }
  });
});

test('the upload path keeps its own entry points under the hostile Blob', async () => {
  await withDeviceBlob(async () => {
    assert.equal(
      await isSupportedBackupBlob(new Blob([sqliteImageText()])),
      true,
      'a SQLite image still goes to the worker'
    );
    assert.equal(
      await isSupportedBackupBlob(new Blob([compoundFileText()])),
      true,
      'the compound dialect does too'
    );
    assert.equal(
      await isSupportedBackupBlob(new Blob([journalEnvelopeText()])),
      false,
      "this app's own envelope still does not"
    );
    assert.equal(
      await detectBackupFormat(new Blob([journalEnvelopeText()])),
      'journal-json',
      'and is still recognised as a supported format'
    );
  });
});
