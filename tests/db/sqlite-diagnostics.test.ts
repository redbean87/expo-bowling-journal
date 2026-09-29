import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

// These tests drive the real `src/db/database.ts` implementation (via its public
// `getDatabase`/`closeDatabase` API) together with the development-only
// `src/db/sqlite-diagnostics.ts` module. `database.ts` imports the native
// `expo-sqlite` package, which cannot load under the plain Node/tsx runner, so
// the bare specifier `expo-sqlite` is remapped to a local `node:sqlite`-backed
// stub for this file only. The remap is registered on this thread via
// `registerHooks` (the async `module.register` API does not intercept under the
// tsx runner) and is deregistered once this file's tests complete.
const stubUrl = pathToFileURL(
  path.join(__dirname, 'expo-sqlite-stub.mjs')
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
type DiagnosticsModule = typeof import('../../src/db/sqlite-diagnostics');

// Dynamic import is required so the `expo-sqlite` remap (registered above) is
// in effect when `database.ts` resolves its import. Both modules are loaded
// here so the diagnostics module's `SCHEMA_VERSION` reference resolves against
// the same stub-backed singleton as `getDatabase()`.
async function loadModules(): Promise<{
  dbModule: DatabaseModule;
  diagnostics: DiagnosticsModule;
}> {
  const [dbModule, diagnostics] = await Promise.all([
    import('../../src/db/database'),
    import('../../src/db/sqlite-diagnostics'),
  ]);
  return { dbModule, diagnostics };
}

test('runSqliteDiagnostics reports a healthy, fully-initialized local journal', async () => {
  const { dbModule, diagnostics } = await loadModules();

  // Let the REAL `getDatabase()` run the migration against the stub.
  const db = await dbModule.getDatabase();

  let report;
  try {
    report = await diagnostics.runSqliteDiagnostics(db);

    // The handle opened and answered every probe.
    assert.equal(report.open, 'open');

    // Initialization reached the current schema version.
    assert.equal(report.initialization, 'initialized');
    assert.equal(report.userVersion, dbModule.SCHEMA_VERSION);
    assert.equal(dbModule.SCHEMA_VERSION, 2);

    // All seven canonical tables are present and none are missing.
    assert.equal(
      report.presentTables.length,
      diagnostics.CANONICAL_TABLE_NAMES.length
    );
    assert.equal(report.missingTables.length, 0);
    for (const name of diagnostics.CANONICAL_TABLE_NAMES) {
      assert.ok(
        report.presentTables.includes(name),
        `expected "${name}" to be reported present`
      );
    }

    // Foreign keys are enforced on the connection (set by ensureDatabase).
    assert.equal(report.foreignKeyEnforcement, 1);

    // Basic read and the isolated write/read/delete round-trip both passed.
    assert.equal(report.readTest, 'pass');
    assert.equal(report.writeReadDeleteSmoke, 'pass');
    assert.equal(report.errors.length, 0);

    // The smoke test must have left this very journal untouched: no rows in any
    // canonical table, and no scratch table lingering in the catalog.
    for (const name of diagnostics.CANONICAL_TABLE_NAMES) {
      const row = (await db.getFirstAsync(
        `SELECT COUNT(*) AS n FROM ${name}`
      )) as { n: number };
      assert.equal(row.n, 0, `expected canonical table "${name}" to be empty`);
    }
    const scratch = await db.getFirstAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = '__bj_sqlite_diag_scratch'"
    );
    assert.equal(
      scratch,
      null,
      'scratch table must not remain after the smoke test'
    );
  } finally {
    // Always release the shared handle so the stub connection is closed.
    await dbModule.closeDatabase();
  }
});
