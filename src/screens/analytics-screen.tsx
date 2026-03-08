import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LeagueId } from '@/services/journal';

import { useLeagueAnalytics, useLeagues } from '@/hooks/journal';
import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import {
  computePersonalRecords,
  type SessionAggregate,
} from '@/utils/analytics-stats';

// ---------------------------------------------------------------------------
// Chart constants
// ---------------------------------------------------------------------------

const CHART_HEIGHT = 100;
const BAR_WIDTH = 30;
const BAR_GAP = 6;

function sessionLabel(s: SessionAggregate, index: number): string {
  if (s.weekNumber !== null) return `W${s.weekNumber}`;
  return `#${index + 1}`;
}

// ---------------------------------------------------------------------------
// Average bar chart
// ---------------------------------------------------------------------------

function AvgBarChart({
  sessions,
  colors,
}: {
  sessions: SessionAggregate[];
  colors: ThemeColors;
}) {
  const avgs = sessions.map((s) =>
    s.gameCount > 0 ? s.totalPins / s.gameCount : 0
  );
  const validAvgs = avgs.filter((a) => a > 0);
  if (validAvgs.length === 0) return null;

  const minA = Math.min(...validAvgs);
  const maxA = Math.max(...validAvgs);
  const range = Math.max(maxA - minA, 20);
  const pad = range * 0.15;
  const yMin = Math.max(0, minA - pad);
  const yMax = Math.min(300, maxA + pad);
  const yRange = yMax - yMin || 1;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ paddingHorizontal: spacing.xs }}>
        <View
          style={{
            height: CHART_HEIGHT,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: BAR_GAP,
          }}
        >
          {sessions.map((s, i) => {
            const avg = avgs[i];
            const barH =
              avg > 0 ? Math.max(4, ((avg - yMin) / yRange) * CHART_HEIGHT) : 4;
            return (
              <View key={s.sessionId} style={{ alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 9,
                    color: colors.textSecondary,
                    marginBottom: 2,
                  }}
                >
                  {avg > 0 ? Math.round(avg) : ''}
                </Text>
                <View
                  style={{
                    width: BAR_WIDTH,
                    height: barH,
                    borderRadius: 4,
                    backgroundColor: avg > 0 ? colors.accent : colors.border,
                  }}
                />
              </View>
            );
          })}
        </View>
        <View
          style={{
            flexDirection: 'row',
            gap: BAR_GAP,
            marginTop: spacing.xs,
          }}
        >
          {sessions.map((s, i) => (
            <Text
              key={s.sessionId}
              style={{
                width: BAR_WIDTH,
                fontSize: 10,
                color: colors.textSecondary,
                textAlign: 'center',
              }}
            >
              {sessionLabel(s, i)}
            </Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Frame distribution stacked bar chart
// ---------------------------------------------------------------------------

function FrameStackedChart({
  sessions,
  colors,
}: {
  sessions: SessionAggregate[];
  colors: ThemeColors;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ paddingHorizontal: spacing.xs }}>
        <View
          style={{
            height: CHART_HEIGHT,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: BAR_GAP,
          }}
        >
          {sessions.map((s) => {
            const total = s.totalStrikes + s.totalSpares + s.totalOpens;
            if (total === 0) {
              return (
                <View
                  key={s.sessionId}
                  style={{
                    width: BAR_WIDTH,
                    height: CHART_HEIGHT,
                    borderRadius: 4,
                    backgroundColor: colors.border,
                  }}
                />
              );
            }
            const strikeH = Math.max(
              2,
              (s.totalStrikes / total) * CHART_HEIGHT
            );
            const spareH = Math.max(2, (s.totalSpares / total) * CHART_HEIGHT);
            const openH = Math.max(2, (s.totalOpens / total) * CHART_HEIGHT);
            return (
              // flexDirection: 'column-reverse' stacks from bottom:
              // first child = bottom segment (strikes)
              <View
                key={s.sessionId}
                style={{
                  width: BAR_WIDTH,
                  height: CHART_HEIGHT,
                  borderRadius: 4,
                  overflow: 'hidden',
                  flexDirection: 'column-reverse',
                }}
              >
                <View
                  style={{ height: strikeH, backgroundColor: colors.accent }}
                />
                <View
                  style={{
                    height: spareH,
                    backgroundColor: colors.success,
                  }}
                />
                <View
                  style={{
                    height: openH,
                    backgroundColor: colors.warning,
                  }}
                />
              </View>
            );
          })}
        </View>
        <View
          style={{
            flexDirection: 'row',
            gap: BAR_GAP,
            marginTop: spacing.xs,
          }}
        >
          {sessions.map((s, i) => (
            <Text
              key={s.sessionId}
              style={{
                width: BAR_WIDTH,
                fontSize: 10,
                color: colors.textSecondary,
                textAlign: 'center',
              }}
            >
              {sessionLabel(s, i)}
            </Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

function RecordCell({
  label,
  value,
  colors,
}: {
  label: string;
  value: string | number;
  colors: ThemeColors;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: '30%',
        alignItems: 'center',
        paddingVertical: spacing.sm,
      }}
    >
      <Text
        style={{
          fontSize: typeScale.title,
          fontWeight: '700',
          color: colors.textPrimary,
        }}
      >
        {String(value)}
      </Text>
      <Text
        style={{
          fontSize: typeScale.bodySm,
          color: colors.textSecondary,
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function LegendDot({
  color,
  label,
  colors,
}: {
  color: string;
  label: string;
  colors: ThemeColors;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
        }}
      />
      <Text style={{ fontSize: typeScale.bodySm, color: colors.textSecondary }}>
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AnalyticsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const { leagues, isLoading: isLeaguesLoading } = useLeagues();
  const [manualLeagueId, setManualLeagueId] = useState<LeagueId | null>(null);
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  // Default to first (most recently active) league when none is manually selected.
  const selectedLeagueId =
    manualLeagueId ??
    (leagues.length > 0 ? (leagues[0]._id as LeagueId) : null);

  const selectedLeague =
    leagues.find((l) => l._id === selectedLeagueId) ?? null;

  const { sessionAggregates, isLoading: isAnalyticsLoading } =
    useLeagueAnalytics(selectedLeagueId);

  const records = useMemo(
    () => computePersonalRecords(sessionAggregates),
    [sessionAggregates]
  );

  const sessionsWithGames = useMemo(
    () => sessionAggregates.filter((s) => s.gameCount > 0),
    [sessionAggregates]
  );

  const isLoading = isLeaguesLoading || isAnalyticsLoading;

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

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : leagues.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No leagues found.</Text>
          </View>
        ) : sessionsWithGames.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No games recorded yet.</Text>
          </View>
        ) : (
          <>
            {/* Personal Records */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Personal Records</Text>
              <View style={styles.recordsGrid}>
                <RecordCell
                  label="High Game"
                  value={records.highGame ?? '-'}
                  colors={colors}
                />
                <RecordCell
                  label="High Series"
                  value={records.highSeries ?? '-'}
                  colors={colors}
                />
                <RecordCell
                  label="Season Avg"
                  value={
                    records.seasonAvg !== null
                      ? records.seasonAvg.toFixed(1)
                      : '-'
                  }
                  colors={colors}
                />
                <RecordCell
                  label="Games"
                  value={records.totalGames}
                  colors={colors}
                />
                <RecordCell
                  label="Strike Rate"
                  value={
                    records.strikeRate !== null
                      ? `${(records.strikeRate * 100).toFixed(0)}%`
                      : '-'
                  }
                  colors={colors}
                />
                <RecordCell
                  label="Spare Rate"
                  value={
                    records.spareRate !== null
                      ? `${(records.spareRate * 100).toFixed(0)}%`
                      : '-'
                  }
                  colors={colors}
                />
              </View>
            </View>

            {/* Average over time */}
            {sessionsWithGames.length > 1 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Average per Session</Text>
                <AvgBarChart sessions={sessionsWithGames} colors={colors} />
              </View>
            ) : null}

            {/* Frame distribution */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Frame Results per Session</Text>
              <View style={styles.legend}>
                <LegendDot
                  color={colors.accent}
                  label="Strike"
                  colors={colors}
                />
                <LegendDot
                  color={colors.success}
                  label="Spare"
                  colors={colors}
                />
                <LegendDot
                  color={colors.warning}
                  label="Open"
                  colors={colors}
                />
              </View>
              <FrameStackedChart sessions={sessionsWithGames} colors={colors} />
            </View>
          </>
        )}
      </ScrollView>

      {/* League picker modal */}
      <Modal
        visible={isPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsPickerVisible(false)}
        >
          <View
            style={[
              styles.modalSheet,
              {
                paddingBottom: Math.max(insets.bottom, spacing.lg),
              },
            ]}
          >
            <Text style={styles.modalTitle}>Select League</Text>
            <ScrollView>
              {leagues.map((league) => (
                <Pressable
                  key={league._id}
                  style={({ pressed }) => [
                    styles.leagueOption,
                    league._id === selectedLeagueId &&
                      styles.leagueOptionSelected,
                    pressed && styles.leagueOptionPressed,
                  ]}
                  onPress={() => {
                    setManualLeagueId(league._id as LeagueId);
                    setIsPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.leagueOptionText,
                      league._id === selectedLeagueId &&
                        styles.leagueOptionTextSelected,
                    ]}
                  >
                    {league.name}
                  </Text>
                  {league._id === selectedLeagueId ? (
                    <MaterialIcons
                      name="check"
                      size={18}
                      color={colors.accent}
                    />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

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
    centered: {
      paddingVertical: spacing.xxl,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: typeScale.body,
      color: colors.textSecondary,
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
    card: {
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      backgroundColor: colors.surface,
    },
    cardTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    recordsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    legend: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      maxHeight: '60%',
    },
    modalTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    leagueOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    leagueOptionSelected: {
      backgroundColor: colors.accentMuted,
    },
    leagueOptionPressed: {
      opacity: 0.75,
    },
    leagueOptionText: {
      fontSize: typeScale.body,
      color: colors.textPrimary,
    },
    leagueOptionTextSelected: {
      color: colors.accent,
      fontWeight: '600',
    },
  });
