/**
 * Local (SQLite-backed) journal service.
 *
 * Exposes the canonical domain types, the `LocalJournalService` contract
 * (C1), and `SqliteLocalJournalService` — the SQLite-backed implementation of
 * the League and Session operations (C2).
 */
export type * from './types';
export type { LocalJournalService } from './local-journal-service';
export { SqliteLocalJournalService } from './sqlite-local-journal-service';
