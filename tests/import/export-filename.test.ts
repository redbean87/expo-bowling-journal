import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseDownloadFileName,
  sanitizeBackupFileName,
} from '../../src/hooks/journal/export-backup/export-filename';

test('parseDownloadFileName returns quoted filename', () => {
  const result = parseDownloadFileName(
    'attachment; filename="bowling-journal-2026-03-01.db"'
  );

  assert.equal(result, 'bowling-journal-2026-03-01.db');
});

test('parseDownloadFileName decodes UTF-8 filename* values', () => {
  const result = parseDownloadFileName(
    "attachment; filename*=UTF-8''bowling%20journal.db"
  );

  assert.equal(result, 'bowling journal.db');
});

test('sanitizeBackupFileName applies fallback and db extension', () => {
  assert.equal(sanitizeBackupFileName('', 'fallback.db'), 'fallback.db');
  assert.equal(
    sanitizeBackupFileName('night backup', 'fallback.db'),
    'night backup.db'
  );
});

test('sanitizeBackupFileName strips reserved characters', () => {
  const result = sanitizeBackupFileName('night:/\\*?|backup.db', 'fallback.db');

  assert.equal(result, 'night------backup.db');
});
