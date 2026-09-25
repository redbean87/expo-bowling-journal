import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

import { CANONICAL_SCHEMA_SQL } from './schema';

/**
 * Local-first SQLite foundation (A2) + canonical schema (A3).
 *
 * This module is the SINGLE application-local access boundary for the local
 * SQLite data store. It owns one shared database handle, opens it lazily,
 * enables foreign-key enforcement, and applies ordered schema migrations so
 * that initialization is safe to call repeatedly.
 *
 * Scope: persistence + schema only. Version 1 (A2) is the foundation baseline
 * (version tracking, no tables); version 2 (A3) creates the seven canonical
 * bowling entities (League, Session, Game, Frame, Ball, House, Pattern) from
 * the DDL in {@link ./schema}. This module exposes NO repositories, CRUD,
 * import/export, UI wiring, or Convex coupling.
 *
 * Isolation: this module imports only `expo-sqlite` and `./schema`. It does not
 * import from `src/convex` or `src/services/journal`, and nothing in the Convex
 * path imports it.
 */

/** Logical name of the single local database file. */
export const DATABASE_NAME = 'bowling-journal.db';

/**
 * The schema version this foundation targets.
 *
 * Must always equal the highest `version` present in {@link MIGRATIONS}.
 * Future schema packets bump this and append a migration; they never rewrite
 * earlier ones (forward-only).
 */
export const SCHEMA_VERSION = 2;

/**
 * A single ordered, forward-only schema migration.
 *
 * `version` is the schema version reached AFTER the migration runs. Migrations
 * are applied in ascending `version` order, each inside its own transaction,
 * and are never re-applied once their version has been recorded.
 */
export interface Migration {
  /** Schema version reached after this migration runs (1-based, unique, ascending). */
  version: number;
  /** Human-readable label (for logs/debug; not persisted). */
  name: string;
  /**
   * Apply the migration to an already-open database. Runs inside a
   * transaction and must not open its own database.
   */
  up: (db: SQLiteDatabase) => Promise<void>;
}

/**
 * Ordered, forward-only migrations, ascending by `version`.
 *
 * Version 1 is the A2 foundation baseline: it establishes version tracking but
 * intentionally creates NO canonical entity tables. It is a DDL no-op so the
 * version mechanism is real and observable from the first open.
 *
 * Version 2 is the A3 canonical schema: it creates the seven canonical bowling
 * entities, their foreign keys, and their indexes (see {@link
 * CANONICAL_SCHEMA_SQL}).
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'a2-foundation-baseline',
    up: async () => {
      // Intentionally empty: A2 creates no canonical tables (see module docs).
    },
  },
  {
    version: 2,
    name: 'a3-canonical-schema',
    up: async (db) => {
      await db.execAsync(CANONICAL_SCHEMA_SQL);
    },
  },
];

/** The single shared database handle; `null` until first open. */
let sharedDatabase: SQLiteDatabase | null = null;

/**
 * In-flight initialization guard: lets concurrent callers share one open +
 * migrate pass (idempotency) and lets a failed init be retried.
 */
let initPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Assert the migration registry is well-formed (1-based, strictly ascending,
 * unique, and capped exactly at {@link SCHEMA_VERSION}).
 *
 * @throws if any invariant is violated.
 */
function assertMigrationsValid(): void {
  let expected = 1;
  for (const migration of MIGRATIONS) {
    if (migration.version !== expected) {
      throw new Error(
        `Invalid migration sequence: expected version ${expected}, got ${migration.version}`
      );
    }
    expected += 1;
  }
  if (expected - 1 !== SCHEMA_VERSION) {
    throw new Error(
      `SCHEMA_VERSION (${SCHEMA_VERSION}) does not match the highest ` +
        `migration version (${expected - 1})`
    );
  }
}

/**
 * Read the currently recorded schema version from the database.
 *
 * Uses SQLite's built-in `PRAGMA user_version` (0 for a brand-new database),
 * so version tracking needs no metadata table.
 */
async function readUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  return row?.user_version ?? 0;
}

/**
 * Open the shared database and bring it up to {@link SCHEMA_VERSION}, applying
 * any pending migrations in order.
 *
 * @returns the newly opened (and migrated) {@link SQLiteDatabase}.
 */
async function ensureDatabase(): Promise<SQLiteDatabase> {
  assertMigrationsValid();

  const db = await openDatabaseAsync(DATABASE_NAME);
  // SQLite foreign keys are OFF per-connection by default; enable them on the
  // shared handle so every DML statement enforces the canonical foreign keys.
  await db.execAsync('PRAGMA foreign_keys = ON');
  const appliedVersion = await readUserVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= appliedVersion) {
      continue;
    }
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }

  return db;
}

/**
 * The single application-local access boundary for the local SQLite store.
 *
 * Idempotent: the first call opens the database, runs pending migrations, and
 * caches the handle; every later call (including concurrent ones) resolves to
 * that same handle without re-running migrations.
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (sharedDatabase) {
    return Promise.resolve(sharedDatabase);
  }
  if (!initPromise) {
    initPromise = ensureDatabase()
      .then((db) => {
        sharedDatabase = db;
        return db;
      })
      .catch((error) => {
        // Clear the guard so a later call can retry after a failed open/migration.
        initPromise = null;
        throw error;
      });
  }
  return initPromise;
}

/**
 * Explicit "initialize" entry point (for app startup and future
 * packets/tests). Ensures the local database is open and migrated, resolving
 * to the same shared handle as {@link getDatabase}.
 */
export function initDatabase(): Promise<SQLiteDatabase> {
  return getDatabase();
}

/**
 * Close the shared handle and reset the singleton so a later {@link
 * getDatabase} / {@link initDatabase} re-opens cleanly.
 *
 * Intended for app lifecycle and tests. Safe to call when nothing is open.
 */
export async function closeDatabase(): Promise<void> {
  const inFlight = initPromise;
  if (inFlight) {
    // Let an in-flight open settle (and populate the shared handle) first.
    await inFlight.catch(() => undefined);
  }
  if (sharedDatabase) {
    await sharedDatabase.closeAsync();
  }
  sharedDatabase = null;
  initPromise = null;
}
