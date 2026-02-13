import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import { type FrameDraft, getFrameStatus } from './game-editor-frame-utils';

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
    <View style={styles.container}>
      <Text style={styles.title}>Frame progress</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {frameDrafts.map((frame, index) => {
          const status = getFrameStatus(index, frame);
          const isActive = index === activeFrameIndex;

          return (
            <Pressable
              key={`frame-pill-${index + 1}`}
              onPress={() => onSelectFrame(index)}
              style={({ pressed }) => [
                styles.pill,
                status === 'complete' ? styles.pillComplete : null,
                status === 'partial' ? styles.pillPartial : null,
                status === 'empty' ? styles.pillEmpty : null,
                isActive ? styles.pillActive : null,
                pressed ? styles.pillPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.pillLabel,
                  status === 'empty'
                    ? styles.pillLabelEmpty
                    : styles.pillLabelFilled,
                  isActive ? styles.pillLabelActive : null,
                ]}
              >
                {index + 1}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    fontSize: typeScale.bodySm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  row: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  pill: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pillEmpty: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillPartial: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentMuted,
  },
  pillComplete: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  pillActive: {
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  pillPressed: {
    opacity: 0.82,
  },
  pillLabel: {
    fontSize: typeScale.body,
    fontWeight: '700',
  },
  pillLabelEmpty: {
    color: colors.textSecondary,
  },
  pillLabelFilled: {
    color: colors.textPrimary,
  },
  pillLabelActive: {
    color: colors.accentText,
  },
});
