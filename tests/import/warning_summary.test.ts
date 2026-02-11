import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeImportWarnings } from '../../convex/lib/import_warning_summary';

test('summarizeImportWarnings preserves unique warnings', () => {
  const warnings = [
    {
      recordType: 'game' as const,
      recordId: 'g1',
      message: 'game is missing weekFk and was skipped',
    },
    {
      recordType: 'session' as const,
      recordId: 's1',
      message: 'week is missing leagueFk and was skipped',
    },
  ];

  assert.deepEqual(summarizeImportWarnings(warnings), warnings);
});

test('summarizeImportWarnings collapses repeated warning category noise', () => {
  const warnings = [
    {
      recordType: 'game' as const,
      recordId: 'g1',
      message: 'game is missing weekFk and was skipped',
    },
    {
      recordType: 'game' as const,
      recordId: 'g2',
      message: 'game is missing weekFk and was skipped',
    },
    {
      recordType: 'game' as const,
      recordId: 'g3',
      message: 'game is missing weekFk and was skipped',
    },
  ];

  const summarized = summarizeImportWarnings(warnings);

  assert.equal(summarized.length, 1);
  assert.deepEqual(summarized[0], {
    recordType: 'game',
    recordId: 'multiple',
    message: 'game is missing weekFk and was skipped (x3)',
  });
});
