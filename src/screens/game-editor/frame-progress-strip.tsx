import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  type FrameDraft,
  getFrameSymbolParts,
} from './game-editor-frame-utils';

import { colors, radius, spacing, typeScale } from '@/theme/tokens';

type FrameProgressStripProps = {
  frameDrafts: FrameDraft[];
  activeFrameIndex: number;
  onSelectFrame: (frameIndex: number) => void;
};

export function FrameProgressStrip({
  frameDrafts,
  activeFrameIndex,
  onSelectFrame,
}: FrameProgressStripProps) {
  return (
    <View style={styles.symbolSection}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.symbolRow}
      >
        {frameDrafts.map((frame, index) => {
          const summaryParts = getFrameSymbolParts(index, frame);
          const slotCount = index === 9 ? 3 : 2;
          const isTenthFrame = index === 9;
          const isActive = index === activeFrameIndex;

          return (
            <Pressable
              key={`frame-symbol-${index + 1}`}
              onPress={() => onSelectFrame(index)}
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
                    </View>
                  );
                })}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  symbolSection: {
    gap: spacing.xs,
  },
  symbolRow: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
    paddingRight: spacing.sm,
  },
  pillPressed: {
    opacity: 0.82,
  },
  symbolCell: {
    width: 44,
    minHeight: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  symbolCellTenth: {
    width: 56,
  },
  symbolCellActive: {
    borderColor: colors.borderStrong,
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
  },
  symbolPartSlotDivider: {
    marginRight: 2,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
});
