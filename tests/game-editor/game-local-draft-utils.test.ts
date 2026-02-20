import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRestoreLocalDraft } from '../../src/screens/game-editor/game-local-draft-utils';

test('restores create-mode local draft when it differs from baseline', () => {
  assert.equal(
    shouldRestoreLocalDraft({
      isCreateMode: true,
      incomingServerSignature: 'server-default',
      localDraftSignature: 'local-draft',
      localDraftBaseServerSignature: 'server-default',
    }),
    true
  );
});

test('does not restore when local and server signatures match', () => {
  assert.equal(
    shouldRestoreLocalDraft({
      isCreateMode: false,
      incomingServerSignature: 'server-a',
      localDraftSignature: 'server-a',
      localDraftBaseServerSignature: 'server-a',
    }),
    false
  );
});

test('restores edit-mode draft only when based on current server signature', () => {
  assert.equal(
    shouldRestoreLocalDraft({
      isCreateMode: false,
      incomingServerSignature: 'server-a',
      localDraftSignature: 'local-b',
      localDraftBaseServerSignature: 'server-a',
    }),
    true
  );

  assert.equal(
    shouldRestoreLocalDraft({
      isCreateMode: false,
      incomingServerSignature: 'server-a',
      localDraftSignature: 'local-b',
      localDraftBaseServerSignature: 'server-older',
    }),
    false
  );
});
