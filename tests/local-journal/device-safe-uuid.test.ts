/**
 * The local journal's id source on a runtime that has no `crypto.randomUUID()`.
 *
 * The phone's Hermes engine ships a `crypto` object with no `randomUUID`
 * member, and the local import path mints an id for every entity it writes —
 * so an id source that only exists in Node or the browser fails on the device
 * before a single row is written. This suite runs the source with those
 * members absent, the way the device has them, instead of assuming Node's
 * globals:
 *
 *   - `crypto.randomUUID()` is used when the runtime has it;
 *   - with it absent, `crypto.getRandomValues()` is assembled into a canonical
 *     v4 UUID, byte for byte what the device gets;
 *   - with both absent, the last-resort generator still yields canonical v4
 *     ids, unique across a whole import;
 *   - the REAL `SqliteLocalJournalService` mints its primary keys through the
 *     same source, so a device-simulated `createLeague` gets a v4 id rather
 *     than throwing — which is what today's code does, and what the phone did.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  CANONICAL_V4_UUID,
  withBareRuntime,
  withCryptoMembers,
  withHermesRuntime,
} from '../harness/device-runtime-globals';

const stubUrl = pathToFileURL(
  path.join(__dirname, '..', 'db', 'expo-sqlite-stub.mjs')
).href;

const hookHandle = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo-sqlite') {
      return { url: stubUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

after(() => {
  hookHandle.deregister();
});

type DatabaseModule = typeof import('../../src/db/database');
type ServiceModule =
  typeof import('../../src/services/local-journal/sqlite-local-journal-service');
type Journal = InstanceType<ServiceModule['SqliteLocalJournalService']>;

/**
 * The source is loaded dynamically, the way the journal's own tests load
 * `src/db/database`, so this file still loads — and its service tests still
 * report the failure they are about — when the source module is missing.
 */
async function mintFromSource(): Promise<() => string> {
  return (await import('../../src/services/local-journal/uuid-source'))
    .newLocalUuid;
}

/**
 * A fresh service over a fresh in-memory database (the shared `tests/db`
 * stub's default), so each test's writes are its own.
 */
async function freshJournal(): Promise<Journal> {
  const dbModule = (await import('../../src/db/database')) as DatabaseModule;

  await dbModule.closeDatabase();

  const serviceModule =
    (await import('../../src/services/local-journal/sqlite-local-journal-service')) as ServiceModule;

  await dbModule.getDatabase();

  return new serviceModule.SqliteLocalJournalService();
}

/** The id one `createLeague` mints, read back through the journal. */
async function mintedLeagueId(): Promise<string> {
  const journal = await freshJournal();
  const league = await journal.createLeague({ name: 'Device Night' });
  const fetched = await journal.getLeague(league.id);

  assert.notEqual(
    fetched,
    null,
    'the id the service returned is the id it stored'
  );

  return league.id;
}

/** A v4 the runtime's own `randomUUID` would hand back, pinned as a stub. */
const STUBBED_V4 = '0f1e2d3c-4b5a-4948-8776-655443322110';

/** The sixteen bytes one `getRandomValues` stub hands out, in order. */
const FIXED_RANDOM_BYTES = new Uint8Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
]);

/**
 * Those same bytes with the version and variant bits set, which is the only
 * place a v4's shape is allowed to change: byte 6 opens with `4`, byte 8 with
 * `8`.
 */
const ASSEMBLED_FROM_FIXED_BYTES = '00010203-0405-4607-8809-0a0b0c0d0e0f';

test('the source prefers crypto.randomUUID when the runtime has it', async () => {
  let mintedByRuntime = 0;

  await withCryptoMembers(
    {
      randomUUID: () => {
        mintedByRuntime += 1;

        return STUBBED_V4;
      },
    },
    async () => {
      const mint = await mintFromSource();

      assert.equal(
        mint(),
        STUBBED_V4,
        "the runtime's own source is used when it exists"
      );
      assert.equal(mint(), STUBBED_V4, 'and again, not a fallback');
    }
  );

  assert.equal(mintedByRuntime, 2, 'both ids came from randomUUID');
});

test('the source assembles a canonical v4 from getRandomValues when randomUUID is absent', async () => {
  let bytesHandedOut = 0;

  await withCryptoMembers(
    {
      randomUUID: undefined,
      getRandomValues: (bytes: Uint8Array) => {
        bytesHandedOut += 1;
        bytes.set(FIXED_RANDOM_BYTES);

        return bytes;
      },
    },
    async () => {
      const mint = await mintFromSource();
      const id = mint();

      assert.equal(
        id,
        ASSEMBLED_FROM_FIXED_BYTES,
        'the bytes are assembled into the v4 form, version and variant bits set'
      );
      assert.match(id, CANONICAL_V4_UUID);
    }
  );

  assert.equal(bytesHandedOut, 1, 'the bytes came from getRandomValues');
});

test('the last-resort source still mints canonical v4 ids, unique across an import', async () => {
  await withBareRuntime(async () => {
    const mint = await mintFromSource();
    const ids = Array.from({ length: 2000 }, () => mint());

    for (const id of ids) {
      assert.match(id, CANONICAL_V4_UUID, 'every id is a canonical v4');
    }

    assert.equal(
      new Set(ids).size,
      ids.length,
      'no two entities in one import share an id'
    );
  });
});

test('the journal service mints its primary keys from the device-safe source', async () => {
  await withHermesRuntime(async () => {
    const id = await mintedLeagueId();

    assert.match(
      id,
      CANONICAL_V4_UUID,
      'the service minted a canonical v4 with no randomUUID present'
    );
  });
});

test('the service still mints v4 keys on a runtime with no CSPRNG member either', async () => {
  await withBareRuntime(async () => {
    const first = await mintedLeagueId();
    const second = await mintedLeagueId();

    assert.match(first, CANONICAL_V4_UUID);
    assert.match(second, CANONICAL_V4_UUID);
    assert.notEqual(
      first,
      second,
      'two imports do not collide on the last-resort source'
    );
  });
});
