import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type SeriesProgressBarProps = {
  currentSeries: number;
  holdTarget: number;
  gainTarget: number;
  perfectSeries: number;
};

const MIN_ZONE2_RATIO = 0.25;
const LABEL_WIDTH = 80;
const BAR_HEIGHT = 10;

function buildZones(
  holdTarget: number,
  gainTarget: number,
  perfectSeries: number
) {
  const gap = gainTarget - holdTarget;
  const buffer = Math.max(gap * 2, 20);
  const leftEdge = Math.max(0, holdTarget - buffer);
  const rightEdge = Math.min(perfectSeries, gainTarget + buffer);

  // Zone proportions: Zone 1 and Zone 3 are naturally linear-proportional.
  // If their natural sizes leave Zone 2 too narrow, steal equally from both
  // to give Zone 2 at least MIN_ZONE2_RATIO — keeping Zone 1 as honest as
  // possible so fill progression feels proportional to actual pin count.
  const naturalZ1 = perfectSeries > 0 ? leftEdge / perfectSeries : 0;
  const naturalZ3 =
    perfectSeries > 0 && rightEdge < perfectSeries
      ? (perfectSeries - rightEdge) / perfectSeries
      : 0;
  const naturalZ2 = 1 - naturalZ1 - naturalZ3;

  let z1Ratio = naturalZ1;
  let z2Ratio = naturalZ2;
  let z3Ratio = naturalZ3;

  if (naturalZ2 < MIN_ZONE2_RATIO) {
    const deficit = MIN_ZONE2_RATIO - naturalZ2;
    const stealEach = deficit / 2;
    z1Ratio = Math.max(0, naturalZ1 - stealEach);
    z3Ratio = Math.max(0, naturalZ3 - stealEach);
    z2Ratio = 1 - z1Ratio - z3Ratio;
  }

  return { leftEdge, rightEdge, z1Ratio, z2Ratio, z3Ratio };
}

function toPixel(
  value: number,
  trackWidth: number,
  leftEdge: number,
  rightEdge: number,
  perfectSeries: number,
  z1Ratio: number,
  z2Ratio: number,
  z3Ratio: number
): number {
  const z1 = trackWidth * z1Ratio;
  const z2 = trackWidth * z2Ratio;
  const z3 = trackWidth * z3Ratio;

  if (leftEdge <= 0) {
    if (value <= rightEdge) {
      return rightEdge > 0 ? (value / rightEdge) * (z1 + z2) : 0;
    }
    const remaining = perfectSeries - rightEdge;
    return (
      z1 + z2 + (remaining > 0 ? ((value - rightEdge) / remaining) * z3 : 0)
    );
  }

  if (value <= leftEdge) {
    return (value / leftEdge) * z1;
  }

  const zone2Span = rightEdge - leftEdge;
  if (value <= rightEdge) {
    return z1 + (zone2Span > 0 ? ((value - leftEdge) / zone2Span) * z2 : 0);
  }

  if (perfectSeries <= rightEdge) {
    return z1 + z2;
  }

  return z1 + z2 + ((value - rightEdge) / (perfectSeries - rightEdge)) * z3;
}

function getFillColor(
  currentSeries: number,
  holdTarget: number,
  gainTarget: number,
  colors: ThemeColors
): string {
  if (currentSeries >= gainTarget) return colors.success;
  if (currentSeries >= holdTarget) return colors.warningBorder;
  return colors.accent;
}

export function SeriesProgressBar({
  currentSeries,
  holdTarget,
  gainTarget,
  perfectSeries,
}: SeriesProgressBarProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [trackWidth, setTrackWidth] = useState(0);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const { leftEdge, rightEdge, z1Ratio, z2Ratio, z3Ratio } = useMemo(
    () => buildZones(holdTarget, gainTarget, perfectSeries),
    [holdTarget, gainTarget, perfectSeries]
  );

  const px = (value: number) =>
    toPixel(
      value,
      trackWidth,
      leftEdge,
      rightEdge,
      perfectSeries,
      z1Ratio,
      z2Ratio,
      z3Ratio
    );

  const fillWidth =
    trackWidth > 0 ? px(Math.min(currentSeries, perfectSeries)) : 0;
  const holdTickLeft = trackWidth > 0 ? px(holdTarget) : 0;
  const gainTickLeft = trackWidth > 0 ? px(gainTarget) : 0;

  const fillColor = getFillColor(currentSeries, holdTarget, gainTarget, colors);

  const centerLeft =
    trackWidth > 0
      ? Math.max(
          0,
          Math.min(
            (holdTickLeft + gainTickLeft) / 2 - LABEL_WIDTH / 2,
            trackWidth - LABEL_WIDTH
          )
        )
      : 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Series</Text>
        <Text style={styles.seriesValue}>{String(currentSeries)}</Text>
      </View>

      {/* 3-zone track with overlaid fill and ticks */}
      <View style={styles.barWrapper} onLayout={onTrackLayout}>
        {/* Zone backgrounds */}
        <View
          style={[
            styles.zone1,
            { flex: z1Ratio, backgroundColor: colors.borderStrong },
          ]}
        />
        <View
          style={[
            styles.zone2,
            { flex: z2Ratio, backgroundColor: colors.accentMuted },
          ]}
        />
        <View
          style={[
            styles.zone3,
            { flex: z3Ratio, backgroundColor: colors.borderStrong },
          ]}
        />

        {/* Fill overlay */}
        {trackWidth > 0 ? (
          <View
            style={[
              styles.fill,
              { width: fillWidth, backgroundColor: fillColor },
            ]}
          />
        ) : null}

        {/* Ticks */}
        {trackWidth > 0 ? (
          <>
            <View
              style={[
                styles.tick,
                { left: holdTickLeft, backgroundColor: colors.textSecondary },
              ]}
            />
            <View
              style={[
                styles.tick,
                { left: gainTickLeft, backgroundColor: colors.textSecondary },
              ]}
            />
          </>
        ) : null}
      </View>

      {/* Single centered label between the two ticks */}
      {trackWidth > 0 ? (
        <View style={styles.labelsRow}>
          <View style={[styles.labelBox, { left: centerLeft }]}>
            <Text
              style={styles.targetNumber}
            >{`${String(holdTarget)} · ${String(gainTarget)}`}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: spacing.xs,
    },
    label: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    seriesValue: {
      fontSize: typeScale.bodySm,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    barWrapper: {
      height: BAR_HEIGHT,
      flexDirection: 'row',
      borderRadius: radius.sm,
      overflow: 'visible',
      position: 'relative',
    },
    zone1: {
      height: BAR_HEIGHT,
      borderTopLeftRadius: radius.sm,
      borderBottomLeftRadius: radius.sm,
    },
    zone2: {
      height: BAR_HEIGHT,
    },
    zone3: {
      height: BAR_HEIGHT,
      borderTopRightRadius: radius.sm,
      borderBottomRightRadius: radius.sm,
    },
    fill: {
      position: 'absolute',
      left: 0,
      top: 0,
      height: BAR_HEIGHT,
      borderRadius: radius.sm,
    },
    tick: {
      position: 'absolute',
      top: -2,
      width: 2,
      height: BAR_HEIGHT + 4,
      borderRadius: 1,
      marginLeft: -1,
    },
    labelsRow: {
      position: 'relative',
      height: 18,
      marginTop: spacing.xs,
    },
    labelBox: {
      position: 'absolute',
      width: LABEL_WIDTH,
      alignItems: 'center',
    },
    targetNumber: {
      fontSize: 11,
      color: colors.textSecondary,
    },
  });
}
