import { useCallback, useEffect, useState } from 'react';

import {
  type CreateSessionInput,
  type LeagueId,
  type RemoveSessionInput,
  type Session,
  type SessionId,
  type UpdateSessionInput,
} from '@/services/journal';
import { listLocalSessionsByLeague } from '@/services/journal/local-reads';
import {
  createSession as localCreateSession,
  removeSession as localRemoveSession,
  updateSession as localUpdateSession,
} from '@/services/journal/local-writes';

export function useSessions(leagueId: LeagueId | null) {
  const [localSessions, setLocalSessions] = useState<Session[] | null>(null);
  const [isLocalSessionsLoading, setIsLocalSessionsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Local SQLite is the authoritative session read: always loaded (when a
  // league is selected), no Convex query, no cloud cache, no auth gate.
  useEffect(() => {
    if (!leagueId) {
      setIsLocalSessionsLoading(false);
      return;
    }

    let isMounted = true;

    const loadLocalSessions = async () => {
      try {
        const localList = await listLocalSessionsByLeague(leagueId);

        if (isMounted) {
          setLocalSessions(localList);
        }
      } catch {
        if (isMounted) {
          setLocalSessions([]);
        }
      } finally {
        if (isMounted) {
          setIsLocalSessionsLoading(false);
        }
      }
    };

    void loadLocalSessions();

    return () => {
      isMounted = false;
    };
  }, [leagueId]);

  // Local-first session writes (C-2): every session mutation goes straight to
  // the SQLite-backed local journal through the app-boundary write adapter
  // (`src/services/journal/local-writes.ts`), the write-side counterpart of
  // the `local-reads.ts` adapter this hook already uses for its read. There
  // is no Convex mutation, no offline-queue enqueue, and no connectivity
  // branch: local mode is the only mode (docs/local-first-architecture.md §1
  // and §3, UI → local service → SQLite), and the legacy journal-create queue
  // is an implementation artifact that stays cloud-only (§2.7). Nothing here
  // reads or writes that queue storage, so entries already persisted in it
  // stay untouched.
  //
  // Create returns the persisted local UUID (no `draft-<clientSyncId>`
  // identifier exists in local mode), so callers route on the real id.
  // `clientSyncId` stays transport-only: the adapter drops it and never
  // stores it. The Convex reference-id mapping step is dropped too — local
  // ids need no server-side resolution, so the ids the caller supplies are
  // already the local ones. Service validation, the session → league
  // foreign key (the documented open-session sentinel resolves to `null`),
  // foreign-key integrity on delete (NO ACTION: a session that still has
  // games rejects, nothing cascades to its games or its league), and error
  // propagation are the service's and are passed through unchanged.
  const createSession = useCallback(
    async (input: CreateSessionInput): Promise<SessionId> => {
      setIsCreating(true);

      try {
        return await localCreateSession(input);
      } finally {
        setIsCreating(false);
      }
    },
    []
  );

  const updateSession = useCallback(
    async (input: UpdateSessionInput) => await localUpdateSession(input),
    []
  );

  const removeSession = useCallback(
    async (input: RemoveSessionInput) => await localRemoveSession(input),
    []
  );

  return {
    sessions: localSessions ?? [],
    isLoading: leagueId !== null && isLocalSessionsLoading,
    createSession,
    updateSession,
    removeSession,
    isCreating,
  };
}
