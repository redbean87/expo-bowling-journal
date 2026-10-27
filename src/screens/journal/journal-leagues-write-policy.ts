/**
 * Local-first league write policy for the journal leagues screen.
 *
 * The leagues screen used to wrap its league create/update/delete calls in
 * the legacy journal-create-queue machinery: an `isNavigatorOffline()`
 * enqueue branch, a `withTimeout(…, 4500)` wrap around the server round-trip,
 * and an `isRetryableCreateError` re-queue fallback. Those existed only to
 * paper over flaky server writes. Under the local-first architecture
 * (docs/local-first-architecture.md §1 and §3: UI → local service → SQLite)
 * local mode is the only mode, so this policy replaces them:
 *
 * - A league write goes straight to the converted SQLite-backed league
 *   operations the screen already calls (`use-leagues` →
 *   `src/services/journal/local-writes.ts`). Connectivity is not a mode
 *   switch, so an offline device still writes, and nothing here reads,
 *   writes, or drains the legacy queue storage — entries already persisted
 *   in it stay untouched.
 * - A row with no local league id — one that only exists as an
 *   already-persisted legacy queue draft — cannot be addressed locally, so
 *   the write reports an error instead of enqueueing a new entry.
 * - Service errors propagate to the caller as a message and are never
 *   converted into a queue entry. A rejected delete (a league that still
 *   has sessions, which the canonical foreign keys enforce with NO ACTION)
 *   surfaces unchanged.
 * - Create returns the persisted local UUID, so the screen routes on the
 *   real id; no `draft-<clientSyncId>` identifier is produced in local mode.
 *
 * Form validation and the screen's UI state transitions stay with the
 * screen; this module decides only which write runs and what the screen
 * reports back.
 */

import type {
  CreateLeagueInput,
  LeagueId,
  RemoveLeagueInput,
  UpdateLeagueInput,
} from '@/services/journal';

/**
 * What a local league write produced: the persisted local id the screen
 * routes on, and the message to show the bowler. A failed write carries no
 * id; a successful one carries no message.
 */
export type LocalLeagueWriteResult = {
  leagueId: string | null;
  error: string | null;
};

function describeWriteFailure(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

/** The league fields the leagues screen's create form collects. */
export type LocalLeagueCreateTarget = {
  name: string;
  clientSyncId: string;
  gamesPerSession: number | null | undefined;
  houseId: string | null;
  leagueType: 'league' | 'tournament';
};

/** The league fields the leagues screen's edit form collects, plus its id. */
export type LocalLeagueUpdateTarget = {
  leagueId: string | null;
  name: string;
  gamesPerSession: number | null | undefined;
  houseId: string | null;
  leagueType: 'league' | 'tournament';
};

/**
 * Create a league locally and return the persisted local id, or the service
 * error. The create never consults connectivity and never queues: an
 * offline device still gets a local league whose real id the screen routes
 * on.
 */
export async function createLeagueLocally(
  createLeague: (input: CreateLeagueInput) => Promise<LeagueId>,
  target: LocalLeagueCreateTarget
): Promise<LocalLeagueWriteResult> {
  try {
    const leagueId = await createLeague({
      name: target.name,
      clientSyncId: target.clientSyncId,
      gamesPerSession: target.gamesPerSession,
      houseId: target.houseId as never,
      leagueType: target.leagueType,
    });

    return { leagueId: String(leagueId), error: null };
  } catch (caught) {
    return {
      leagueId: null,
      error: describeWriteFailure(caught, 'Unable to create league.'),
    };
  }
}

/**
 * Update a league locally and report a failure message, or `null` when the
 * write succeeded. A target with no local id is not addressable locally, so
 * it reports instead of enqueueing; an unknown id rejects in the service and
 * propagates the same way.
 */
export async function updateLeagueLocally(
  updateLeague: (input: UpdateLeagueInput) => Promise<LeagueId>,
  target: LocalLeagueUpdateTarget
): Promise<LocalLeagueWriteResult> {
  if (target.leagueId === null) {
    return {
      leagueId: null,
      error: 'League is required before saving a league edit.',
    };
  }

  try {
    const leagueId = await updateLeague({
      leagueId: target.leagueId as never,
      name: target.name,
      gamesPerSession: target.gamesPerSession,
      houseId: target.houseId as never,
      leagueType: target.leagueType,
    });

    return { leagueId: String(leagueId), error: null };
  } catch (caught) {
    return {
      leagueId: null,
      error: describeWriteFailure(caught, 'Unable to update league.'),
    };
  }
}

/**
 * Delete a league locally and report a failure message, or `null` when the
 * delete succeeded. The service's foreign-key integrity is unchanged: a
 * league that still has sessions rejects, and that rejection is surfaced
 * rather than turned into a queued delete.
 */
export async function deleteLeagueLocally(
  removeLeague: (input: RemoveLeagueInput) => Promise<LeagueId>,
  leagueId: string | null
): Promise<LocalLeagueWriteResult> {
  if (leagueId === null) {
    return {
      leagueId: null,
      error: 'League is required before deleting a league.',
    };
  }

  try {
    const removed = await removeLeague({ leagueId: leagueId as never });

    return { leagueId: String(removed), error: null };
  } catch (caught) {
    return {
      leagueId: null,
      error: describeWriteFailure(caught, 'Unable to delete league.'),
    };
  }
}
