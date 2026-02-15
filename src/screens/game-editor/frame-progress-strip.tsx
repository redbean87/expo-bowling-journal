import { useEffect, useRef, useState } from 'react';
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
  getFrameSymbolParts,
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
  const regularCellHeight = isExtraLargePhone ? 88 : isLargePhone ? 78 : 62;
  const regularSymbolFontSize = isExtraLargePhone ? 21 : isLargePhone ? 19 : 17;
  const regularFrameIndexFontSize = isExtraLargePhone
    ? 19
    : isLargePhone
      ? 17
      : 15;
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
  const symbolCellHeight = layoutMode === 'compact' ? 48 : regularCellHeight;
  const symbolFontSize = layoutMode === 'compact' ? 15 : regularSymbolFontSize;
  const frameIndexFontSize =
    layoutMode === 'compact' ? 13 : regularFrameIndexFontSize;

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

  const rowContent = frameDrafts.map((frame, index) => {
    const summaryParts = getFrameSymbolParts(index, frame);
    const slotCount = index === 9 ? 3 : 2;
    const isTenthFrame = index === 9;
    const isLastFrame = index === frameDrafts.length - 1;
    const isActive = index === activeFrameIndex;
    const activeSlotIndex =
      activeField === 'roll1Mask' ? 0 : activeField === 'roll2Mask' ? 1 : 2;

    return (
      <Pressable
        key={`frame-symbol-${index + 1}`}
        onPress={() => onSelectFrame(index)}
        hitSlop={8}
        onLayout={(event) => {
          if (layoutMode === 'compact') {
            return;
          }

          const { x, width: cellWidth } = event.nativeEvent.layout;
          cellLayoutsRef.current[index] = { x, width: cellWidth };
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
        <Text
          style={[
            styles.symbolFrameIndex,
            { fontSize: frameIndexFontSize },
            isActive ? styles.symbolFrameIndexActive : null,
          ]}
        >
          {index + 1}
        </Text>
        <View style={styles.symbolPartsRow}>
          {Array.from({ length: slotCount }, (_, slotIndex) => {
            const part = summaryParts[slotIndex] ?? '';

            return (
              <View
                key={`symbol-part-${index + 1}-${slotIndex + 1}`}
                style={[
                  styles.symbolPartSlot,
                  slotIndex < slotCount - 1
                    ? styles.symbolPartSlotWithDivider
                    : null,
                ]}
              >
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
                {isActive && slotIndex === activeSlotIndex ? (
                  <View style={styles.symbolPartMarker} />
                ) : null}
              </View>
            );
          })}
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
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
    backgroundColor: colors.accentMuted,
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
    fontWeight: '600',
    color: colors.textSecondary,
  },
  symbolFrameIndexActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  symbolPartsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 0,
  },
  symbolPartSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 5,
    position: 'relative',
  },
  symbolPartSlotWithDivider: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  symbolPartMarker: {
    position: 'absolute',
    left: '50%',
    marginLeft: -8,
    bottom: 1,
    width: 16,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
});
