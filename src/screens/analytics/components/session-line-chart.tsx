import * as shape from 'd3-shape';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { Circle, G, Line as SvgLine } from 'react-native-svg';
import { AreaChart, LineChart, XAxis, YAxis } from 'react-native-svg-charts';

import type { SessionAggregate } from '@/utils/analytics-stats';

import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';

const CHART_HEIGHT = 120;
const Y_AXIS_WIDTH = 32;
const CONTENT_INSET = { top: 12, bottom: 12, left: 8, right: 8 } as const;
const TOOLTIP_W = 76;

function sessionLabel(s: SessionAggregate, index: number): string {
  if (s.weekNumber !== null) return `W${s.weekNumber}`;
  return `#${index + 1}`;
}

function indexToPixelX(
  index: number,
  count: number,
  containerWidth: number
): number {
  if (count <= 1) return CONTENT_INSET.left;
  const usable = containerWidth - CONTENT_INSET.left - CONTENT_INSET.right;
  return CONTENT_INSET.left + (index / (count - 1)) * usable;
}

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

interface SessionLineChartProps {
  sessions: SessionAggregate[];
  values: number[];
  color: string;
  colors: ThemeColors;
  trendValues?: (number | null)[];
}

export function SessionLineChart({
  sessions,
  values,
  color,
  colors,
  trendValues,
}: SessionLineChartProps) {
  const [selection, setSelection] = useState<{
    index: number;
    left: number;
  } | null>(null);
  const chartWidth = useRef(0);
  const valuesRef = useRef(values);

  useEffect(() => {
    valuesRef.current = values;
  });

  const calcSelection = useCallback((locationX: number) => {
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
  }, []);

  const panResponder = useMemo(() => {
    // refs are only accessed inside callbacks, not during render
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

  // Web-specific mouse handlers for chart scrubbing
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
          <View
            {...panResponder.panHandlers}
            {...webHandlers}
            style={s.overlay}
          />
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
