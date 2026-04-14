import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LeagueId, SessionId } from '@/services/journal';

import { Button, Card } from '@/components/ui';
import { useGames, useSessions } from '@/hooks/journal';
import { buildJournalGamesRouteParams } from '@/screens/journal/journal-route-params';
import {
  findSessionIdForDate,
  formatIsoDateForToday,
  formatIsoDateLabel,
} from '@/screens/journal-fast-lane-utils';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type HomeTonightCardProps = {
  league: {
    _id: string;
    name: string;
    houseName: string | null;
    gamesPerSession: number | null;
  };
  isLoading: boolean;
  onLeaguePickerPress: () => void;
};

export function HomeTonightCard({
  league,
  isLoading,
  onLeaguePickerPress,
}: HomeTonightCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeLeagueId = league._id as LeagueId;
  const { sessions } = useSessions(activeLeagueId);
  const today = formatIsoDateForToday();
  const todaySessionId = useMemo(
    () => findSessionIdForDate(sessions, today),
    [sessions, today]
  );
  const activeSession = useMemo(() => {
    if (todaySessionId) {
      return sessions.find((session) => session._id === todaySessionId) ?? null;
    }
    return sessions[0] ?? null;
  }, [sessions, todaySessionId]);
  const activeSessionId = (activeSession?._id as SessionId | undefined) ?? null;
  const { games } = useGames(activeSessionId);

  const isComplete = useMemo(() => {
    if (!activeSession || !league.gamesPerSession) return false;
    return games.length >= league.gamesPerSession;
  }, [activeSession, league.gamesPerSession, games.length]);

  const primaryActionLabel = useMemo(() => {
    if (!activeSession) return 'Start tonight';
    if (isComplete) return 'View tonight';
    return 'Continue bowling';
  }, [activeSession, isComplete]);

  const sessionLabel = useMemo(() => {
    if (!activeSession) return 'No session yet';
    const prefix = todaySessionId ? 'Tonight' : 'Most recent';
    return `${prefix} · ${formatIsoDateLabel(activeSession.date)}`;
  }, [activeSession, todaySessionId]);

  const handlePrimaryAction = () => {
    if (!activeLeagueId) return;

    if (isComplete || !activeSession) {
      router.push({
        pathname: '/journal/[leagueId]/sessions' as never,
        params: { leagueId: activeLeagueId } as never,
      } as never);
    } else {
      router.push({
        pathname: '/journal/[leagueId]/sessions/[sessionId]/games' as never,
        params: buildJournalGamesRouteParams({
          leagueId: activeLeagueId,
          sessionId: activeSessionId!,
        }) as never,
      } as never);
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Play tonight</Text>

      <Pressable
        onPress={onLeaguePickerPress}
        style={({ pressed }) => [
          styles.leaguePicker,
          pressed ? styles.leaguePickerPressed : null,
        ]}
      >
        <View style={styles.leaguePickerContent}>
          <Text style={styles.leagueName}>{league.name}</Text>
          <Text style={styles.leagueHouse}>
            {league.houseName ?? 'No house set'}
          </Text>
        </View>
        <MaterialIcons
          name="expand-more"
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>

      <Text style={styles.sessionLabel}>{sessionLabel}</Text>

      <Button
        disabled={!activeLeagueId || isLoading}
        label={primaryActionLabel}
        onPress={handlePrimaryAction}
        variant="secondary"
      />
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      gap: spacing.sm,
    },
    cardTitle: {
      fontSize: typeScale.title,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    leaguePicker: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
    },
    leaguePickerPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    leaguePickerContent: {
      flex: 1,
    },
    leagueName: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    leagueHouse: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    sessionLabel: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
    },
  });
