import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  type FrameDraft,
  getFrameSplitFlags,
  getFrameSymbolParts,
  getSettledRunningTotals,
  type RollField,
} from './game-editor-frame-utils';

import { type ScoreboardLayoutMode } from '@/config/preferences-storage';
import { colors, radius, spacing } from '@/theme/tokens';

type FrameProgressStripProps = {
  frameDrafts: FrameDraft[];
  activeFrameIndex: number;
  activeField: RollField;
  layoutMode: ScoreboardLayoutMode;
  onSelectFrame: (frameIndex: number) => void;
};

export function FrameProgressStrip({
  frameDrafts,
  activeFrameIndex,
  activeField,
  layoutMode,
  onSelectFrame,
}: FrameProgressStripProps) {
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const cellLayoutsRef = useRef<Record<number, { x: number; width: number }>>(
    {}
  );
  const [trackWidth, setTrackWidth] = useState(0);
  const isLargePhone = width >= 430 && height >= 860;
  const isExtraLargePhone = width >= 500 && height >= 920;
  const regularCellWidth = isExtraLargePhone ? 94 : isLargePhone ? 83 : 68;
  const tenthCellWidth = isExtraLargePhone ? 120 : isLargePhone ? 107 : 88;
  const regularCellHeight = isExtraLargePhone ? 84 : isLargePhone ? 74 : 60;
  const regularSymbolFontSize = isExtraLargePhone ? 21 : isLargePhone ? 19 : 17;
  const regularFrameIndexFontSize = isExtraLargePhone
    ? 14
    : isLargePhone
      ? 13
      : 12;
  const compactAvailableWidth = Math.max(0, trackWidth - 2);
  const compactRegularCellWidth = Math.max(
    30,
    Math.floor(compactAvailableWidth / 10.3)
  );
  const compactTenthCellWidth = Math.max(
    compactRegularCellWidth,
    compactAvailableWidth - compactRegularCellWidth * 9
  );
  const symbolCellWidth =
    layoutMode === 'compact' ? compactRegularCellWidth : regularCellWidth;
  const symbolCellTenthWidth =
    layoutMode === 'compact' ? compactTenthCellWidth : tenthCellWidth;
  const symbolCellHeight = layoutMode === 'compact' ? 53 : regularCellHeight;
  const symbolFontSize = layoutMode === 'compact' ? 14 : regularSymbolFontSize;
  const frameIndexFontSize =
    layoutMode === 'compact' ? 10 : regularFrameIndexFontSize;
  const frameScoreFontSize = layoutMode === 'compact' ? 11 : 13;
  const frameNumberRowHeight = layoutMode === 'compact' ? 13 : 14;
  const markRowHeight = layoutMode === 'compact' ? 24 : 30;
  const scoreRowHeight = layoutMode === 'compact' ? 15 : 18;
  const runningTotals = useMemo(
    () => getSettledRunningTotals(frameDrafts),
    [frameDrafts]
  );

  useEffect(() => {
    if (layoutMode === 'compact' || trackWidth === 0) {
      return;
    }

    const layout = cellLayoutsRef.current[activeFrameIndex];

    if (!layout) {
      return;
    }

    const targetX = Math.max(0, layout.x + layout.width / 2 - trackWidth / 2);

    scrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [activeFrameIndex, layoutMode, trackWidth]);

  const frameStripData = frameDrafts.map((frame, index) => ({
    frameIndex: index,
    summaryParts: getFrameSymbolParts(index, frame),
    splitFlags: getFrameSplitFlags(index, frame),
  }));

  const rowContent = frameStripData.map((frameData) => {
    const { frameIndex, summaryParts, splitFlags } = frameData;
    const slotCount = frameIndex === 9 ? 3 : 2;
    const isTenthFrame = frameIndex === 9;
    const isLastFrame = frameIndex === frameDrafts.length - 1;
    const isActive = frameIndex === activeFrameIndex;
    const activeSlotIndex =
      activeField === 'roll1Mask' ? 0 : activeField === 'roll2Mask' ? 1 : 2;

    return (
      <Pressable
        key={`frame-symbol-${frameIndex + 1}`}
        onPress={() => onSelectFrame(frameIndex)}
        hitSlop={8}
        onLayout={(event) => {
          if (layoutMode === 'compact') {
            return;
          }

          const { x, width: cellWidth } = event.nativeEvent.layout;
          cellLayoutsRef.current[frameIndex] = { x, width: cellWidth };
        }}
        style={({ pressed }) => [
          styles.symbolCell,
          {
            width: symbolCellWidth,
            minHeight: symbolCellHeight,
          },
          isTenthFrame ? styles.symbolCellTenth : null,
          isLastFrame ? styles.symbolCellLast : null,
          isTenthFrame ? { width: symbolCellTenthWidth } : null,
          isActive ? styles.symbolCellActive : null,
          pressed ? styles.pillPressed : null,
        ]}
      >
        <View
          style={[styles.frameNumberRow, { minHeight: frameNumberRowHeight }]}
        >
          <Text
            style={[
              styles.symbolFrameIndex,
              { fontSize: frameIndexFontSize },
              isActive ? styles.symbolFrameIndexActive : null,
            ]}
          >
            {frameIndex + 1}
          </Text>
        </View>
        <View style={[styles.symbolPartsRow, { minHeight: markRowHeight }]}>
          {Array.from({ length: slotCount }, (_, slotIndex) => {
            const part = summaryParts[slotIndex] ?? '';
            const splitRingSize =
              symbolFontSize + (layoutMode === 'compact' ? 3 : 6);
            const hasSplit =
              slotIndex === 0
                ? splitFlags.roll1
                : slotIndex === 1
                  ? splitFlags.roll2
                  : splitFlags.roll3;

            return (
              <View
                key={`symbol-part-${frameIndex + 1}-${slotIndex + 1}`}
                style={[
                  styles.symbolPartSlot,
                  slotIndex < slotCount - 1
                    ? styles.symbolPartSlotWithDivider
                    : null,
                ]}
              >
                <View style={styles.symbolTextWrap}>
                  <View
                    style={[
                      styles.symbolTextBadge,
                      {
                        width: splitRingSize,
                        height: splitRingSize,
                        borderRadius: splitRingSize / 2,
                      },
                    ]}
                  >
                    {hasSplit ? (
                      <View
                        style={[
                          styles.splitRing,
                          {
                            width: splitRingSize,
                            height: splitRingSize,
                            borderRadius: splitRingSize / 2,
                          },
                          isActive ? styles.splitRingActive : null,
                        ]}
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.symbolText,
                        { fontSize: symbolFontSize },
                        part ? null : styles.symbolTextEmpty,
                        isActive ? styles.symbolTextActive : null,
                      ]}
                    >
                      {part}
                    </Text>
                  </View>
                </View>
                {isActive && slotIndex === activeSlotIndex ? (
                  <View style={styles.symbolPartMarker} />
                ) : null}
              </View>
            );
          })}
        </View>
        <View style={[styles.frameScoreRow, { minHeight: scoreRowHeight }]}>
          <Text
            style={[styles.frameScoreText, { fontSize: frameScoreFontSize }]}
          >
            {runningTotals[frameIndex] === null
              ? ''
              : runningTotals[frameIndex]}
          </Text>
        </View>
      </Pressable>
    );
  });

  return (
    <View style={styles.symbolSection}>
      <View
        style={styles.symbolTrack}
        onLayout={(event) => {
          setTrackWidth(event.nativeEvent.layout.width);
        }}
      >
        {layoutMode === 'compact' ? (
          <View style={styles.symbolRow}>{rowContent}</View>
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.symbolRow}
          >
            {rowContent}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  symbolSection: {
    gap: spacing.xs,
  },
  symbolTrack: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  symbolRow: {
    flexDirection: 'row',
    paddingRight: 0,
  },
  pillPressed: {
    opacity: 0.82,
  },
  symbolCell: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    backgroundColor: colors.surfaceSubtle,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  symbolCellLast: {
    borderRightWidth: 0,
  },
  symbolCellTenth: {
    width: 58,
  },
  symbolCellActive: {
    backgroundColor: '#F0F5FF',
  },
  symbolText: {
    fontWeight: '700',
    color: colors.textPrimary,
    minHeight: 16,
  },
  symbolTextEmpty: {
    color: colors.textSecondary,
  },
  symbolTextActive: {
    color: colors.accent,
  },
  symbolFrameIndex: {
    fontWeight: '500',
    color: colors.textSecondary,
  },
  symbolFrameIndexActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  frameNumberRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolPartsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 0,
  },
  frameScoreRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 1,
  },
  frameScoreText: {
    fontWeight: '500',
    color: colors.textPrimary,
    opacity: 0.68,
    fontVariant: ['tabular-nums'],
  },
  symbolPartSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
    position: 'relative',
  },
  symbolTextWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 18,
  },
  symbolTextBadge: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolPartSlotWithDivider: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  splitRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(201, 54, 54, 0.7)',
    backgroundColor: 'transparent',
  },
  splitRingActive: {
    borderWidth: 1,
    borderColor: 'rgba(201, 54, 54, 0.8)',
  },
  symbolPartMarker: {
    position: 'absolute',
    left: '50%',
    marginLeft: -7,
    bottom: 4,
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    opacity: 0.72,
  },
});
