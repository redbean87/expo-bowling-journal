import { MaterialIcons } from '@expo/vector-icons';
import * as shape from 'd3-shape';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, G, Line as SvgLine } from 'react-native-svg';
import { AreaChart, LineChart, XAxis, YAxis } from 'react-native-svg-charts';

import type { LeagueId } from '@/services/journal';

import { useLeagueAnalytics, useLeagues } from '@/hooks/journal';
import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';
import {
  computeCumulativeAverage,
  computeGamePositionAvgs,
  computePersonalRecords,
  type SessionAggregate,
} from '@/utils/analytics-stats';

// ---------------------------------------------------------------------------
// Chart constants
// ---------------------------------------------------------------------------

const CHART_HEIGHT = 120;
const Y_AXIS_WIDTH = 32;
const CONTENT_INSET = { top: 12, bottom: 12, left: 8, right: 8 } as const;

// Stacked bar chart dimensions (frame distribution)
const BAR_WIDTH = 30;
const BAR_GAP = 6;

function sessionLabel(s: SessionAggregate, index: number): string {
  if (s.weekNumber !== null) return `W${s.weekNumber}`;
  return `#${index + 1}`;
}

// ---------------------------------------------------------------------------
// Session area/line chart
// ---------------------------------------------------------------------------

const TOOLTIP_W = 76;

// Converts a data index to its pixel X coordinate within the chart container,
// mirroring the linear scale react-native-svg-charts uses internally.
function indexToPixelX(
  index: number,
  count: number,
  containerWidth: number
): number {
  if (count <= 1) return CONTENT_INSET.left;
  const usable = containerWidth - CONTENT_INSET.left - CONTENT_INSET.right;
  return CONTENT_INSET.left + (index / (count - 1)) * usable;
}

// SVG decorator: only the scrub line + hollow dot — no text bubble.
// react-native-svg-charts clones this element and injects x, y, data, height.
function ChartScrubber({
  x,
  y,
  data,
  selectedIndex,
  color,
  colors,
}: {
  x?: (i: number) => number;
  y?: (v: number) => number;
  data?: number[];
  selectedIndex: number | null;
  color: string;
  colors: ThemeColors;
}) {
  if (selectedIndex === null || !x || !y || !data) return null;
  const cx = x(selectedIndex);
  const cy = y(data[selectedIndex]);
  return (
    <G>
      <SvgLine
        x1={cx}
        x2={cx}
        y1={0}
        y2={CHART_HEIGHT}
        stroke={colors.textSecondary}
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.5}
      />
      <Circle
        cx={cx}
        cy={cy}
        r={5}
        stroke={color}
        strokeWidth={2}
        fill={colors.surface}
      />
    </G>
  );
}

const createSessionLineChartStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row' },
    yAxis: { width: Y_AXIS_WIDTH },
    body: { flex: 1, marginLeft: spacing.xs },
    container: { height: CHART_HEIGHT },
    absolute: {
      height: CHART_HEIGHT,
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
    },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    tooltipCard: {
      position: 'absolute',
      top: CHART_HEIGHT / 2 - 22,
      width: TOOLTIP_W,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs,
    },
    tooltipSession: { fontSize: typeScale.bodySm, color: colors.textSecondary },
    tooltipValue: {
      fontSize: typeScale.body,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    tooltipTrend: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      marginTop: 1,
    },
  });

function SessionLineChart({
  sessions,
  values,
  color,
  colors,
  trendValues,
}: {
  sessions: SessionAggregate[];
  values: number[];
  color: string;
  colors: ThemeColors;
  trendValues?: (number | null)[];
}) {
  // { index, left } — computed entirely in event handlers to avoid ref access during render
  const [selection, setSelection] = useState<{
    index: number;
    left: number;
  } | null>(null);
  const chartWidth = useRef(0);
  const valuesRef = useRef(values);

  // Sync ref outside render (satisfies react-hooks/refs)
  useEffect(() => {
    valuesRef.current = values;
  });

  // Computes both the snapped index and the clamped tooltip left position.
  // Called only from event handlers — never during render.
  const calcSelection = useCallback(
    (locationX: number) => {
      if (!Number.isFinite(locationX)) return null;
      const cw = chartWidth.current;
      const vLen = valuesRef.current.length;
      const usable = cw - CONTENT_INSET.left - CONTENT_INSET.right;
      const raw = ((locationX - CONTENT_INSET.left) / usable) * (vLen - 1);
      const index = Math.max(0, Math.min(vLen - 1, Math.round(raw)));
      const pixelX = indexToPixelX(index, vLen, cw);
      const left = Math.max(
        4,
        Math.min(cw - TOOLTIP_W - 4, pixelX - TOOLTIP_W / 2)
      );
      return { index, left };
    },
    [] // reads from refs — no reactive deps needed
  );

  const panResponder = useMemo(() => {
    // PanResponder.create stores the callbacks — it does not call them during
    // creation, so the ref accesses inside calcSelection are safe here.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e) =>
        setSelection(calcSelection(e.nativeEvent.locationX)),
      onPanResponderMove: (e) =>
        setSelection(calcSelection(e.nativeEvent.locationX)),
      onPanResponderRelease: () => setSelection(null),
      onPanResponderTerminate: () => setSelection(null),
    });
  }, [calcSelection]);

  // Web-only mouse handlers (onMouseMove / onMouseLeave are not in RN's ViewProps)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webHandlers: any = {
    onMouseMove: (e: { nativeEvent: { offsetX: number } }) =>
      setSelection(calcSelection(e.nativeEvent.offsetX)),
    onMouseLeave: () => setSelection(null),
  };

  const s = useMemo(() => createSessionLineChartStyles(colors), [colors]);

  if (values.every((v) => v === 0)) return null;

  return (
    <View style={s.row}>
      <YAxis
        data={values}
        numberOfTicks={4}
        contentInset={{ top: CONTENT_INSET.top, bottom: CONTENT_INSET.bottom }}
        style={s.yAxis}
        formatLabel={(v: number) => String(Math.round(v))}
        svg={{ fontSize: 9, fill: colors.textSecondary }}
      />
      <View style={s.body}>
        {/* Layered chart: fill-only area + stroke-only line to avoid edge drops */}
        <View
          style={s.container}
          onLayout={(e) => {
            chartWidth.current = e.nativeEvent.layout.width;
          }}
        >
          <AreaChart
            data={values}
            contentInset={CONTENT_INSET}
            style={s.absolute}
            curve={shape.curveMonotoneX}
            svg={{ fill: color, fillOpacity: 0.15, stroke: 'none' }}
          />
          <LineChart
            data={values}
            contentInset={CONTENT_INSET}
            style={s.absolute}
            curve={shape.curveMonotoneX}
            svg={{ stroke: color, strokeWidth: 2 }}
          >
            <ChartScrubber
              selectedIndex={selection?.index ?? null}
              color={color}
              colors={colors}
            />
          </LineChart>
          {trendValues ? (
            <LineChart
              data={trendValues.map((v) => v ?? 0)}
              contentInset={CONTENT_INSET}
              style={s.absolute}
              curve={shape.curveMonotoneX}
              svg={{
                stroke: color,
                strokeWidth: 1.5,
                strokeOpacity: 0.45,
                strokeDasharray: '5 4',
              }}
            />
          ) : null}
          {/* Transparent overlay — captures touch (panHandlers) and mouse hover (web) */}
          <View
            {...panResponder.panHandlers}
            {...webHandlers}
            style={s.overlay}
          />
          {/* Native tooltip card — no ref access during render */}
          {selection !== null ? (
            <View
              pointerEvents="none"
              style={[s.tooltipCard, { left: selection.left }]}
            >
              <Text style={s.tooltipSession}>
                {sessionLabel(sessions[selection.index], selection.index)}
              </Text>
              <Text style={s.tooltipValue}>
                {Math.round(values[selection.index])}
              </Text>
              {trendValues?.[selection.index] != null ? (
                <Text style={s.tooltipTrend}>
                  To date {(trendValues[selection.index] as number).toFixed(1)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <XAxis
          data={values}
          contentInset={{
            left: CONTENT_INSET.left,
            right: CONTENT_INSET.right,
          }}
          numberOfTicks={Math.min(sessions.length, 6)}
          style={{ marginTop: spacing.xs }}
          formatLabel={(value: number) => {
            const idx = Math.round(value);
            return sessions[idx] ? sessionLabel(sessions[idx], idx) : '';
          }}
          svg={{ fontSize: 10, fill: colors.textSecondary }}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Frame distribution stacked bar chart
// ---------------------------------------------------------------------------

const createFrameChartStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    padding: { paddingHorizontal: spacing.xs },
    bars: {
      height: CHART_HEIGHT,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: BAR_GAP,
    },
    emptyBar: {
      width: BAR_WIDTH,
      height: CHART_HEIGHT,
      borderRadius: radius.sm,
      backgroundColor: colors.border,
    },
    bar: {
      width: BAR_WIDTH,
      height: CHART_HEIGHT,
      borderRadius: radius.sm,
      overflow: 'hidden',
      flexDirection: 'column-reverse',
    },
    segmentStrike: { backgroundColor: colors.accent },
    segmentSpare: { backgroundColor: colors.success },
    segmentOpen: { backgroundColor: colors.warning },
    labelRow: {
      flexDirection: 'row',
      gap: BAR_GAP,
      marginTop: spacing.xs,
    },
    labelText: {
      width: BAR_WIDTH,
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });

function FrameStackedChart({
  sessions,
  colors,
}: {
  sessions: SessionAggregate[];
  colors: ThemeColors;
}) {
  const s = useMemo(() => createFrameChartStyles(colors), [colors]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={s.padding}>
        <View style={s.bars}>
          {sessions.map((session) => {
            const total =
              session.totalStrikes + session.totalSpares + session.totalOpens;
            if (total === 0) {
              return <View key={session.sessionId} style={s.emptyBar} />;
            }
            const strikeH = Math.max(
              2,
              (session.totalStrikes / total) * CHART_HEIGHT
            );
            const spareH = Math.max(
              2,
              (session.totalSpares / total) * CHART_HEIGHT
            );
            const openH = Math.max(
              2,
              (session.totalOpens / total) * CHART_HEIGHT
            );
            return (
              // flexDirection: 'column-reverse' stacks from bottom:
              // first child = bottom segment (strikes)
              <View key={session.sessionId} style={s.bar}>
                <View style={[s.segmentStrike, { height: strikeH }]} />
                <View style={[s.segmentSpare, { height: spareH }]} />
                <View style={[s.segmentOpen, { height: openH }]} />
              </View>
            );
          })}
        </View>
        <View style={s.labelRow}>
          {sessions.map((session, i) => (
            <Text key={session.sessionId} style={s.labelText}>
              {sessionLabel(session, i)}
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

const createRecordCellStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    cell: {
      flex: 1,
      minWidth: '30%',
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    valueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    value: {
      fontSize: typeScale.title,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    label: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
      marginTop: 2,
    },
  });

function RecordCell({
  label,
  value,
  trend,
  colors,
}: {
  label: string;
  value: string | number;
  trend?: number | null;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createRecordCellStyles(colors), [colors]);

  const trendIcon =
    trend == null
      ? null
      : trend > 0
        ? ({ name: 'trending-up', color: colors.success } as const)
        : trend < 0
          ? ({ name: 'trending-down', color: colors.danger } as const)
          : null;

  return (
    <View style={s.cell}>
      <View style={s.valueRow}>
        <Text style={s.value}>{String(value)}</Text>
        {trendIcon ? (
          <MaterialIcons
            name={trendIcon.name}
            size={16}
            color={trendIcon.color}
          />
        ) : null}
      </View>
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

const createLegendDotStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    dot: { width: 10, height: 10, borderRadius: 5 },
    label: { fontSize: typeScale.bodySm, color: colors.textSecondary },
  });

function LegendDot({
  color,
  label,
  colors,
}: {
  color: string;
  label: string;
  colors: ThemeColors;
}) {
  const s = useMemo(() => createLegendDotStyles(colors), [colors]);

  return (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Game position averages card
// ---------------------------------------------------------------------------

const GAME_BAR_HEIGHT = 60;

const createGamePositionStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-around' },
    col: { alignItems: 'center', gap: spacing.xs },
    avgText: { fontSize: typeScale.bodySm, fontWeight: '700' },
    avgTextBest: { color: colors.accent },
    avgTextDefault: { color: colors.textPrimary },
    barContainer: {
      height: GAME_BAR_HEIGHT,
      justifyContent: 'flex-end',
      width: 36,
    },
    bar: { backgroundColor: colors.accent, borderRadius: radius.sm },
    posLabel: { fontSize: typeScale.bodySm, color: colors.textSecondary },
  });

function GamePositionCard({
  positions,
  colors,
}: {
  positions: { position: number; avg: number; count: number }[];
  colors: ThemeColors;
}) {
  const s = useMemo(() => createGamePositionStyles(colors), [colors]);

  const avgs = positions.map((p) => p.avg);
  const minAvg = Math.min(...avgs);
  const maxAvg = Math.max(...avgs);
  const range = maxAvg - minAvg || 1;
  const bestIdx = avgs.indexOf(maxAvg);

  return (
    <View style={s.row}>
      {positions.map((p, i) => {
        const barH = Math.max(
          8,
          ((p.avg - minAvg) / range) * (GAME_BAR_HEIGHT - 8) + 8
        );
        const isBest = i === bestIdx;
        return (
          <View key={p.position} style={s.col}>
            <Text
              style={[s.avgText, isBest ? s.avgTextBest : s.avgTextDefault]}
            >
              {p.avg.toFixed(1)}
            </Text>
            <View style={s.barContainer}>
              <View
                style={[s.bar, { height: barH, opacity: isBest ? 1 : 0.35 }]}
              />
            </View>
            <Text style={s.posLabel}>Game {p.position + 1}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Analytics content (handles loading / empty / data states)
// ---------------------------------------------------------------------------

function AnalyticsContent({
  isLoading,
  leagues,
  sessionsWithGames,
  records,
  gamePositionAvgs,
  colors,
  styles,
}: {
  isLoading: boolean;
  leagues: { _id: string }[];
  sessionsWithGames: SessionAggregate[];
  records: ReturnType<typeof computePersonalRecords>;
  gamePositionAvgs: ReturnType<typeof computeGamePositionAvgs>;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (leagues.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No leagues found.</Text>
      </View>
    );
  }

  if (sessionsWithGames.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No games recorded yet.</Text>
      </View>
    );
  }

  return (
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
              records.seasonAvg !== null ? records.seasonAvg.toFixed(1) : '-'
            }
            trend={records.avgTrend}
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
          <RecordCell
            label="Clean Games"
            value={records.cleanGames}
            colors={colors}
          />
          <View style={styles.recordSpacer} />
          <View style={styles.recordSpacer} />
        </View>
      </View>

      {/* Game position averages */}
      {gamePositionAvgs.length >= 2 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Game Averages</Text>
          <GamePositionCard positions={gamePositionAvgs} colors={colors} />
        </View>
      )}

      {/* Average over time */}
      {sessionsWithGames.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Average per Session</Text>
          <SessionLineChart
            sessions={sessionsWithGames}
            values={sessionsWithGames.map((s) =>
              s.gameCount > 0 ? s.totalPins / s.gameCount : 0
            )}
            trendValues={computeCumulativeAverage(
              sessionsWithGames.map((s) =>
                s.gameCount > 0 ? s.totalPins / s.gameCount : null
              )
            )}
            color={colors.accent}
            colors={colors}
          />
        </View>
      )}

      {/* High game per session */}
      {sessionsWithGames.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>High Game per Session</Text>
          <SessionLineChart
            sessions={sessionsWithGames}
            values={sessionsWithGames.map((s) => s.highGame ?? 0)}
            trendValues={computeCumulativeAverage(
              sessionsWithGames.map((s) => s.highGame)
            )}
            color={colors.success}
            colors={colors}
          />
        </View>
      )}

      {/* Frame distribution */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Frame Results per Session</Text>
        <View style={styles.legend}>
          <LegendDot color={colors.accent} label="Strike" colors={colors} />
          <LegendDot color={colors.success} label="Spare" colors={colors} />
          <LegendDot color={colors.warning} label="Open" colors={colors} />
        </View>
        <FrameStackedChart sessions={sessionsWithGames} colors={colors} />
      </View>
    </>
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

  const gamePositionAvgs = useMemo(
    () => computeGamePositionAvgs(sessionsWithGames),
    [sessionsWithGames]
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

        <AnalyticsContent
          isLoading={isLoading}
          leagues={leagues}
          sessionsWithGames={sessionsWithGames}
          records={records}
          gamePositionAvgs={gamePositionAvgs}
          colors={colors}
          styles={styles}
        />
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
    recordSpacer: { flex: 1, minWidth: '30%' },
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
