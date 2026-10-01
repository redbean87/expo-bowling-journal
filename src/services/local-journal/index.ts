/**
 * Local (SQLite-backed) journal service.
 *
 * Exposes the canonical domain types, the `LocalJournalService` contract
 * (C1), and `SqliteLocalJournalService` — the SQLite-backed implementation
 * of the full contract (C2–C5, including derived game scoring).
 */
export type * from './types';
export type { LocalJournalService } from './local-journal-service';
export { getLocalJournalService } from './accessor';
export { SqliteLocalJournalService } from './sqlite-local-journal-service';
