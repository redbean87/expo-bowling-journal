/**
 * Application-level singleton accessor for the local journal service.
 *
 * The app has exactly one local journal — the canonical SQLite database
 * owned by `src/db` — and this accessor lazily creates and caches the
 * single shared `SqliteLocalJournalService` instance so every consumer
 * resolves the same service. The service itself is stateless (all state
 * lives in the SQLite database), so the singleton guarantees one shared
 * instance, not shared in-memory state.
 */
import { SqliteLocalJournalService } from './sqlite-local-journal-service';

import type { LocalJournalService } from './local-journal-service';

let sharedLocalJournalService: LocalJournalService | null = null;

/**
 * Returns the shared {@link LocalJournalService} instance, creating it on
 * first use.
 */
export function getLocalJournalService(): LocalJournalService {
  if (sharedLocalJournalService === null) {
    sharedLocalJournalService = new SqliteLocalJournalService();
  }

  return sharedLocalJournalService;
}
