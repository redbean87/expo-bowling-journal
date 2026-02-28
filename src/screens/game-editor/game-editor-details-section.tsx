import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { ReferenceCombobox } from '@/components/reference-combobox';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type GameEditorDetailsSectionProps = {
  isDetailsVisible: boolean;
  onToggleDetails: () => void;
  patternOptions: ReferenceOption<string>[];
  recentPatternOptions: ReferenceOption<string>[];
  selectedPatternId: string | null;
  createPattern: (name: string) => Promise<ReferenceOption<string>>;
  ballOptions: ReferenceOption<string>[];
  recentBallOptions: ReferenceOption<string>[];
  selectedBallId: string | null;
  createBall: (name: string) => Promise<ReferenceOption<string>>;
  buildSuggestions: (
    allOptions: ReferenceOption<string>[],
    recentOptions: ReferenceOption<string>[],
    query: string
  ) => ReferenceOption<string>[];
  onSelectPattern: (option: ReferenceOption<string>) => void;
  onSelectBall: (option: ReferenceOption<string>) => void;
};

export function GameEditorDetailsSection({
  isDetailsVisible,
  onToggleDetails,
  patternOptions,
  recentPatternOptions,
  selectedPatternId,
  createPattern,
  ballOptions,
  recentBallOptions,
  selectedBallId,
  createBall,
  buildSuggestions,
  onSelectPattern,
  onSelectBall,
}: GameEditorDetailsSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.detailsSection,
        isDetailsVisible ? styles.detailsSectionOpen : null,
      ]}
    >
      <Pressable
        onPress={onToggleDetails}
        style={({ pressed }) => [
          styles.detailsToggle,
          pressed ? styles.detailsTogglePressed : null,
        ]}
      >
        <Text style={styles.detailsToggleLabel}>
          {isDetailsVisible ? 'Hide details' : 'Add details'}
        </Text>
      </Pressable>

      {isDetailsVisible ? (
        <View style={styles.detailsFields}>
          <ReferenceCombobox
            allOptions={patternOptions}
            createLabel="Add pattern"
            getSuggestions={buildSuggestions}
            onQuickAdd={createPattern}
            onSelect={onSelectPattern}
            placeholder="Pattern (optional)"
            recentOptions={recentPatternOptions}
            valueId={selectedPatternId}
          />
          <ReferenceCombobox
            allOptions={ballOptions}
            createLabel="Add ball"
            getSuggestions={buildSuggestions}
            onQuickAdd={createBall}
            onSelect={onSelectBall}
            placeholder="Ball (optional)"
            recentOptions={recentBallOptions}
            valueId={selectedBallId}
          />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    detailsSection: {
      gap: spacing.xs,
    },
    detailsSectionOpen: {
      position: 'relative',
      zIndex: 30,
      elevation: 30,
    },
    detailsToggle: {
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    detailsTogglePressed: {
      opacity: 0.75,
    },
    detailsToggleLabel: {
      fontSize: typeScale.body,
      fontWeight: '500',
      color: colors.accent,
    },
    detailsFields: {
      gap: spacing.xs,
    },
  });
