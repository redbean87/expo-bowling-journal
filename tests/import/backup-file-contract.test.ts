import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeBackupFileName } from '../../src/hooks/journal/export-backup/export-filename';
import {
  WEB_BACKUP_ACCEPT,
  WEB_BACKUP_PICKER_TYPES,
  pickBackupFileOnWeb,
} from '../../src/hooks/journal/import-backup/file-picker-web';
import {
  detectBackupFormat,
  isSupportedBackupBlob,
  validateBackupBlob,
} from '../../src/hooks/journal/import-backup/file-validation';
import {
  JOURNAL_BACKUP_FILE_EXTENSION,
  JOURNAL_BACKUP_FORMAT,
  JOURNAL_BACKUP_VERSION,
} from '../../src/services/local-journal/journal-backup-format';

// C-4 T2 — the file contract shared by export, the web picker, and validation.
//
// Three modules are covered, all driven with in-memory blobs so nothing is
// written to a device and no user data is touched:
//
// - `file-validation` classifies a selected file from its BYTES. The new
//   journal JSON envelope is recognised, and the legacy PinPal SQLite image
//   (raw, and the PinPal Lite compound variant) is recognised as legacy rather
//   than as the new format. Malformed JSON, a foreign `format` tag, and an
//   unsupported `version` each get their own actionable message.
// - `file-picker-web` offers the new `.json` extension alongside the legacy
//   PinPal extensions, and a cancelled/unsupported selection yields `null`.
// - `export-filename` names a journal export `.json`, matching the serialized
//   artifact, while a legacy `.db` fallback keeps its `.db`.

function backupBlob(text: string): Blob {
  return new Blob([text]);
}

function journalBackupJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: JOURNAL_BACKUP_FORMAT,
    version: JOURNAL_BACKUP_VERSION,
    exportedAt: '2026-10-28T13:58:00.000Z',
    data: {
      balls: [],
      houses: [],
      patterns: [],
      leagues: [],
      sessions: [],
      games: [],
      frames: [],
    },
    ...overrides,
  });
}

function sqliteBackupText(): string {
  return `SQLite format 3\u0000${'padding'.repeat(64)}`;
}

function compoundBackupText(): string {
  const plist =
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist><dict/></plist>';
  const padding = 'x'.repeat(4096 - plist.length > 0 ? 4096 - plist.length : 0);

  return `${plist}${padding}${sqliteBackupText()}`;
}

test('a version-1 journal envelope validates as journal-json', async () => {
  const validation = await validateBackupBlob(backupBlob(journalBackupJson()));

  assert.equal(validation.format, 'journal-json');
  assert.deepEqual(validation.errors, []);
});

test('a journal envelope is detected even when the name says .pinpal', async () => {
  const namedFile = new File(
    [journalBackupJson()],
    'mislabelled-pinpal.pinpal'
  );

  assert.equal(await detectBackupFormat(namedFile), 'journal-json');
});

test('a foreign format tag is rejected with the tag named', async () => {
  const validation = await validateBackupBlob(
    backupBlob(journalBackupJson({ format: 'pinpal-lite' }))
  );

  assert.equal(validation.format, null);
  assert.match(
    validation.errors[0],
    /declares the format "pinpal-lite"/
    /* The reader names what it found, never a generic "invalid file". */
  );
});

test('an unsupported envelope version is rejected with both versions named', async () => {
  const validation = await validateBackupBlob(
    backupBlob(journalBackupJson({ version: JOURNAL_BACKUP_VERSION + 1 }))
  );

  assert.equal(validation.format, null);
  assert.match(validation.errors[0], /uses version 2/);
  assert.match(validation.errors[0], /reads version 1/);
});

test('a missing format or version field is rejected as an unsupported header', async () => {
  const missingFormat = await validateBackupBlob(
    backupBlob(
      JSON.stringify({
        version: JOURNAL_BACKUP_VERSION,
        exportedAt: '2026-10-28T13:58:00.000Z',
        data: {},
      })
    )
  );

  assert.equal(missingFormat.format, null);
  assert.match(missingFormat.errors[0], /no "format" field/);

  const missingVersion = await validateBackupBlob(
    backupBlob(
      JSON.stringify({
        format: JOURNAL_BACKUP_FORMAT,
        exportedAt: '2026-10-28T13:58:00.000Z',
        data: {},
      })
    )
  );

  assert.equal(missingVersion.format, null);
  assert.match(missingVersion.errors[0], /no "version"/);
});

test('malformed JSON gets a parse-specific error, not a format error', async () => {
  const validation = await validateBackupBlob(
    backupBlob('{"format": "bowling-journal", "version": 1,')
  );

  assert.equal(validation.format, null);
  assert.match(validation.errors[0], /opens like JSON but is not readable/);
});

test('a JSON array is rejected from its content, not its name', async () => {
  const validation = await validateBackupBlob(
    backupBlob('[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]')
  );

  assert.equal(validation.format, null);
  assert.match(validation.errors[0], /not a backup this app can read/);
});

test('a legacy PinPal SQLite image is legacy, never journal-json', async () => {
  const validation = await validateBackupBlob(backupBlob(sqliteBackupText()));

  assert.equal(validation.format, 'pinpal-sqlite');
  assert.deepEqual(validation.errors, []);
});

test('a PinPal Lite compound file is legacy, never journal-json', async () => {
  const validation = await validateBackupBlob(backupBlob(compoundBackupText()));

  assert.equal(validation.format, 'pinpal-lite-compound');
  assert.deepEqual(validation.errors, []);
});

test('a file that is not a backup names both supported formats', async () => {
  const validation = await validateBackupBlob(
    backupBlob('just some text that is definitely not a backup file')
  );

  assert.equal(validation.format, null);
  assert.match(validation.errors[0], /bowling journal \.json/);
  assert.match(validation.errors[0], /PinPal SQLite database backup/);
});

test('an empty selection is rejected without touching the pipeline', async () => {
  const validation = await validateBackupBlob(backupBlob(''));

  assert.equal(validation.format, null);
  assert.match(validation.errors[0], /file is empty/);
});

test('the worker upload path still takes SQLite images only', async () => {
  assert.equal(
    await isSupportedBackupBlob(backupBlob(sqliteBackupText())),
    true
  );
  assert.notEqual(
    await isSupportedBackupBlob(backupBlob(journalBackupJson())),
    true
  );
});

test('the web picker accepts .json and the legacy PinPal extensions', () => {
  const accepted = WEB_BACKUP_ACCEPT.split(',');

  assert.equal(accepted.includes('.json'), true);
  assert.equal(accepted.includes('.pinpal'), true);
  assert.equal(accepted.includes('.db'), true);
  assert.deepEqual(WEB_BACKUP_PICKER_TYPES[0].accept['application/json'], [
    '.json',
  ]);
  assert.deepEqual(
    WEB_BACKUP_PICKER_TYPES[1].accept['application/octet-stream'],
    ['.pinpal', '.db', '.sqlite', '.sqlite3', '.backup']
  );
});

test('an unavailable or cancelled picker selection returns null', async () => {
  assert.equal(await pickBackupFileOnWeb(), null);
});

test('a journal export filename ends in the serialized artifact extension', () => {
  const fileName = sanitizeBackupFileName(
    'night backup',
    `bowling-journal-2026-10-28${JOURNAL_BACKUP_FILE_EXTENSION}`
  );

  assert.equal(fileName, `night backup${JOURNAL_BACKUP_FILE_EXTENSION}`);
  assert.equal(
    sanitizeBackupFileName('night backup', 'bowling-journal-2026-10-28'),
    'night backup.json'
  );
});

test('a legacy .db fallback keeps its legacy extension', () => {
  assert.equal(
    sanitizeBackupFileName('night backup', 'bowling-journal-2026-10-28.db'),
    'night backup.db'
  );
  assert.equal(
    sanitizeBackupFileName('night:/\\*?|backup.db', 'fallback.db'),
    'night------backup.db'
  );
});
