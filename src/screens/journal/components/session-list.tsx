import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { SeasonStatsCard } from './season-stats-card';
import { SessionRowCard } from './session-row-card';
import { formatIsoDateLabel } from '../../journal-fast-lane-utils';
import { buildSessionNightSummary } from '../../journal-games-night-summary';
import { buildJournalGamesRouteParams } from '../journal-route-params';

import type { SessionActionTarget } from './session-actions-modal';
import type { DisplaySession } from '@/hooks/journal/use-session-queue';
import type { LeagueId, SessionId } from '@/services/journal';
import type { Router } from 'expo-router';

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
  leagueType: LeagueType;
  isSessionsLoading: boolean;
  isLeagueGamesLoading: boolean;
  displaySessions: DisplaySession[];
  deletingSessionRowId: string | null;
  derivedWeekNumberBySessionId: Map<string, number>;
  sessionActionError: string | null;
  seasonSummary: ReturnType<typeof buildSessionNightSummary>;
  openSessionActions: (target: SessionActionTarget) => void;
  router: Router;
};

export function SessionList({
  leagueId,
  leagueClientSyncId,
  leagueType,
  isSessionsLoading,
  isLeagueGamesLoading,
  displaySessions,
  deletingSessionRowId,
  derivedWeekNumberBySessionId,
  sessionActionError,
  seasonSummary,
  openSessionActions,
  router,
}: SessionListProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {sessionActionError ? (
        <Text style={styles.errorText}>{sessionActionError}</Text>
      ) : null}

      {leagueId && (
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
        const weekNumber =
          session.weekNumber ??
          (session.sessionId
            ? (derivedWeekNumberBySessionId.get(
                session.sessionId as SessionId
              ) ?? null)
            : null);

        const formattedDate = formatIsoDateLabel(session.date);
        const weekLabel = sessionLabel(weekNumber, leagueType, formattedDate);
        const isOpen = leagueType === 'open';

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
                  sessionWeekNumber: weekNumber,
                }) as never,
              } as never)
            }
            onOpenActions={() =>
              openSessionActions({
                rowId: session.id,
                sessionId: session.sessionId,
                sessionClientSyncId: session.clientSyncId,
                date: session.date,
                weekNumber: session.weekNumber ?? null,
                houseId: session.houseId,
                patternId: session.patternId,
                ballId: session.ballId,
                title: isOpen ? weekLabel : `${weekLabel} - ${formattedDate}`,
              })
            }
            sessionDateLabel={isOpen ? '' : formattedDate}
            sessionWeekLabel={weekLabel}
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
