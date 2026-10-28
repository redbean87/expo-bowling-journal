import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { SeasonStatsCard } from './season-stats-card';
import { SessionRowCard } from './session-row-card';
import { formatIsoDateLabel } from '../../journal-fast-lane-utils';
import { buildSessionNightSummary } from '../../journal-games-night-summary';
import { buildJournalGamesRouteParams } from '../journal-route-params';

import type { SessionActionTarget } from './session-actions-modal';
import type { DisplaySession } from '@/hooks/journal/use-session-queue';
import type { LeagueId } from '@/services/journal';
import type { SessionAggregate } from '@/utils/analytics-stats';
import type { Router } from 'expo-router';

import { LOCAL_JOURNAL_OPEN_LEAGUE_ID } from '@/services/journal/local-reads';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import { sessionLabel, type LeagueType } from '@/utils/league-type-utils';

type SessionListProps = {
  leagueId: LeagueId | null;
  leagueClientSyncId: string | null;
  _leagueType: LeagueType;
  isSessionsLoading: boolean;
  isLeagueGamesLoading: boolean;
  displaySessions: DisplaySession[];
  deletingSessionRowId: string | null;
  _derivedWeekNumberBySessionId: Map<string, number>;
  sessionActionError: string | null;
  seasonSummary: ReturnType<typeof buildSessionNightSummary>;
  openSessionActions: (target: SessionActionTarget) => void;
  router: Router;
  sessionAggregates: SessionAggregate[];
};

/**
 * The documented open-session sentinel {@link LOCAL_JOURNAL_OPEN_LEAGUE_ID} is
 * the route token C-3 gives a session that belongs to no league (its SQLite
 * `leagueId` foreign key is `null`). It is a route token, not a league: the
 * league-scoped aggregate hooks must not be asked for it, and the session
 * list must not render league-scoped aggregates for it. Every other
 * identifier — a real league UUID or no league at all — is not the open route.
 */
export function isOpenLeagueRoute(leagueId: LeagueId | null): boolean {
  return leagueId === LOCAL_JOURNAL_OPEN_LEAGUE_ID;
}

export function SessionList({
  leagueId,
  leagueClientSyncId,
  _leagueType,
  isSessionsLoading,
  isLeagueGamesLoading,
  displaySessions,
  deletingSessionRowId,
  _derivedWeekNumberBySessionId,
  sessionActionError,
  seasonSummary,
  openSessionActions,
  router,
  sessionAggregates,
}: SessionListProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isOpenRoute = isOpenLeagueRoute(leagueId);

  const aggregatesBySessionId = useMemo(() => {
    const map = new Map<string, SessionAggregate>();
    for (const aggregate of sessionAggregates) {
      map.set(aggregate.sessionId, aggregate);
    }
    return map;
  }, [sessionAggregates]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {sessionActionError ? (
        <Text style={styles.errorText}>{sessionActionError}</Text>
      ) : null}

      {leagueId && !isOpenRoute && (
        <SeasonStatsCard
          isLoading={isLeagueGamesLoading}
          seasonSummary={seasonSummary}
          sessionCount={displaySessions.length}
        />
      )}

      {isSessionsLoading ? (
        <Text style={styles.meta}>Loading sessions...</Text>
      ) : null}
      {!isSessionsLoading && !leagueId && !leagueClientSyncId ? (
        <Text style={styles.meta}>League not found.</Text>
      ) : null}
      {!isSessionsLoading &&
      (leagueId || leagueClientSyncId) &&
      displaySessions.length === 0 ? (
        <Text style={styles.meta}>No sessions yet. Tap + to create one.</Text>
      ) : null}

      {displaySessions.map((session) => {
        const formattedDate = formatIsoDateLabel(session.date);
        const sessionTitle = sessionLabel(formattedDate);
        // C-3.4: an open session has no league, so its league-scoped
        // per-session statistics (game count, series total, average, high
        // game) are not looked up and the row card renders without them.
        const aggregate =
          isOpenRoute || !session.sessionId
            ? undefined
            : aggregatesBySessionId.get(session.sessionId);

        return (
          <SessionRowCard
            key={session.id}
            isDeleting={deletingSessionRowId === session.id}
            onNavigate={() =>
              router.push({
                pathname:
                  '/journal/[leagueId]/sessions/[sessionId]/games' as never,
                params: buildJournalGamesRouteParams({
                  leagueId:
                    leagueId ?? `draft-${leagueClientSyncId ?? 'league'}`,
                  sessionId:
                    session.sessionId ??
                    `draft-${session.clientSyncId ?? 'session'}`,
                  leagueClientSyncId,
                  sessionClientSyncId: session.clientSyncId,
                  sessionDate: session.date,
                  sessionWeekNumber: null,
                }) as never,
              } as never)
            }
            onOpenActions={() =>
              openSessionActions({
                rowId: session.id,
                sessionId: session.sessionId,
                sessionClientSyncId: session.clientSyncId,
                date: session.date,
                weekNumber: null,
                houseId: session.houseId,
                patternId: session.patternId,
                ballId: session.ballId,
                title: sessionTitle,
              })
            }
            _sessionDateLabel=""
            sessionWeekLabel={sessionTitle}
            gameCount={aggregate?.gameCount}
            seriesTotal={aggregate?.totalPins}
            average={
              aggregate && aggregate.gameCount > 0
                ? Math.round(aggregate.totalPins / aggregate.gameCount)
                : undefined
            }
            highGame={aggregate?.highGame ?? undefined}
          />
        );
      })}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl + 72,
    },
    errorText: {
      fontSize: typeScale.bodySm,
      color: colors.danger,
    },
    meta: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
  });
