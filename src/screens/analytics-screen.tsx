import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnalyticsContent, LeaguePickerModal } from './analytics/components';

import type { LeagueId } from '@/services/journal';

import {
  useLeagueAnalytics,
  useLeagues,
  useSpareConversionAnalytics,
} from '@/hooks/journal';
import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import {
  computeGamePositionAvgs,
  computePersonalRecords,
} from '@/utils/analytics-stats';
import { resolveLeagueType } from '@/utils/league-type-utils';

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      gap: spacing.md,
      padding: spacing.md,
    },
    leaguePicker: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    pickerPressed: {
      opacity: 0.82,
    },
    pickerLabel: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    pickerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flex: 1,
      justifyContent: 'flex-end',
    },
    pickerValue: {
      fontSize: typeScale.body,
      color: colors.textPrimary,
      fontWeight: '600',
      flexShrink: 1,
    },
  });

export default function AnalyticsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const { leagues, isLoading: isLeaguesLoading } = useLeagues();
  const [manualLeagueId, setManualLeagueId] = useState<LeagueId | null>(null);
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  const defaultLeagueId = useMemo(() => {
    const firstRegular = leagues.find((l) => resolveLeagueType(l) === 'league');
    return ((firstRegular ?? leagues[0])?._id as LeagueId | undefined) ?? null;
  }, [leagues]);

  const selectedLeagueId = manualLeagueId ?? defaultLeagueId;
  const selectedLeague =
    leagues.find((l) => l._id === selectedLeagueId) ?? null;

  const gamesPerSession = selectedLeague?.gamesPerSession ?? null;

  const { sessionAggregates, isLoading: isAnalyticsLoading } =
    useLeagueAnalytics(selectedLeagueId);

  const { spareConversion, isLoading: isSpareConversionLoading } =
    useSpareConversionAnalytics(selectedLeagueId);

  const records = useMemo(
    () => computePersonalRecords(sessionAggregates),
    [sessionAggregates]
  );

  const sessionsWithGames = useMemo(
    () => sessionAggregates.filter((s) => s.gameCount > 0),
    [sessionAggregates]
  );

  const gamePositionAvgs = useMemo(
    () => computeGamePositionAvgs(sessionsWithGames),
    [sessionsWithGames]
  );

  const isLoading =
    isLeaguesLoading || isAnalyticsLoading || isSpareConversionLoading;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) + 80 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* League picker */}
        <Pressable
          style={({ pressed }) => [
            styles.leaguePicker,
            pressed && styles.pickerPressed,
          ]}
          onPress={() => setIsPickerVisible(true)}
        >
          <Text style={styles.pickerLabel}>League</Text>
          <View style={styles.pickerRight}>
            <Text style={styles.pickerValue} numberOfLines={1}>
              {selectedLeague?.name ??
                (isLeaguesLoading ? 'Loading...' : 'Select league')}
            </Text>
            <MaterialIcons
              name="expand-more"
              size={20}
              color={colors.textSecondary}
            />
          </View>
        </Pressable>

        <AnalyticsContent
          isLoading={isLoading}
          leagues={leagues}
          sessionsWithGames={sessionsWithGames}
          records={records}
          gamePositionAvgs={gamePositionAvgs}
          spareConversion={spareConversion}
          isSpareConversionLoading={isSpareConversionLoading}
          gamesPerSession={gamesPerSession}
          colors={colors}
        />
      </ScrollView>

      <LeaguePickerModal
        visible={isPickerVisible}
        onClose={() => setIsPickerVisible(false)}
        leagues={leagues}
        selectedLeagueId={selectedLeagueId}
        onSelect={setManualLeagueId}
        colors={colors}
      />
    </View>
  );
}
