import { useEffect, useRef, useState } from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  type FrameDraft,
  getFrameSymbolParts,
  type RollField,
} from './game-editor-frame-utils';

import { colors, radius, spacing, typeScale } from '@/theme/tokens';

type FrameProgressStripProps = {
  frameDrafts: FrameDraft[];
  activeFrameIndex: number;
  activeField: RollField;
  onSelectFrame: (frameIndex: number) => void;
};

export function FrameProgressStrip({
  frameDrafts,
  activeFrameIndex,
  activeField,
  onSelectFrame,
}: FrameProgressStripProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const cellLayoutsRef = useRef<Record<number, { x: number; width: number }>>(
    {}
  );
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    if (trackWidth === 0) {
      return;
    }

    const layout = cellLayoutsRef.current[activeFrameIndex];

    if (!layout) {
      return;
    }

    const targetX = Math.max(0, layout.x + layout.width / 2 - trackWidth / 2);

    scrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [activeFrameIndex, trackWidth]);

  return (
    <View style={styles.symbolSection}>
      <View
        style={styles.symbolTrack}
        onLayout={(event) => {
          setTrackWidth(event.nativeEvent.layout.width);
        }}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.symbolRow}
        >
          {frameDrafts.map((frame, index) => {
            const summaryParts = getFrameSymbolParts(index, frame);
            const slotCount = index === 9 ? 3 : 2;
            const isTenthFrame = index === 9;
            const isActive = index === activeFrameIndex;
            const activeSlotIndex =
              activeField === 'roll1Mask'
                ? 0
                : activeField === 'roll2Mask'
                  ? 1
                  : 2;

            return (
              <Pressable
                key={`frame-symbol-${index + 1}`}
                onPress={() => onSelectFrame(index)}
                hitSlop={8}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  cellLayoutsRef.current[index] = { x, width };
                }}
                style={({ pressed }) => [
                  styles.symbolCell,
                  isTenthFrame ? styles.symbolCellTenth : null,
                  isActive ? styles.symbolCellActive : null,
                  pressed ? styles.pillPressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.symbolFrameIndex,
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
                            ? styles.symbolPartSlotDivider
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.symbolText,
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
          })}
        </ScrollView>
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
    paddingRight: 0,
  },
  pillPressed: {
    opacity: 0.82,
  },
  symbolCell: {
    width: 46,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.surfaceSubtle,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  symbolCellTenth: {
    width: 58,
  },
  symbolCellActive: {
    backgroundColor: colors.accentMuted,
  },
  symbolText: {
    fontSize: typeScale.bodySm,
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
    fontSize: 11,
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
    justifyContent: 'center',
    gap: 0,
  },
  symbolPartSlot: {
    width: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 2,
    paddingBottom: 5,
    position: 'relative',
  },
  symbolPartMarker: {
    position: 'absolute',
    bottom: 1,
    width: 12,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  symbolPartSlotDivider: {
    marginRight: 2,
    borderRightWidth: 1,
    borderRightColor: colors.borderStrong,
  },
});
