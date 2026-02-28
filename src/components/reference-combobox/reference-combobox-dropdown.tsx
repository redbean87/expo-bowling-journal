import { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ReferenceComboboxDropdownProps = {
  hasQuery: boolean;
  suggestions: ReferenceOption<string>[];
  highlightedIndex: number;
  emptyState: 'none' | 'noRecent' | 'noMatches';
  exactMatchOption: ReferenceOption<string> | null;
  queryTrimmed: string;
  shouldShowQuickAdd: boolean;
  isCreating: boolean;
  createLabel: string;
  dropdownAnimationStyle: {
    opacity: Animated.Value;
    transform: Array<{ translateY: Animated.Value }>;
  };
  onSelectOption: (option: ReferenceOption<string>) => void;
  onQuickAddPress: () => void;
};

export function ReferenceComboboxDropdown({
  hasQuery,
  suggestions,
  highlightedIndex,
  emptyState,
  exactMatchOption,
  queryTrimmed,
  shouldShowQuickAdd,
  isCreating,
  createLabel,
  dropdownAnimationStyle,
  onSelectOption,
  onQuickAddPress,
}: ReferenceComboboxDropdownProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Animated.View style={[styles.dropdown, dropdownAnimationStyle]}>
      <Text style={styles.sectionLabel}>{hasQuery ? 'Matches' : 'Recent'}</Text>
      {suggestions.map((option, index) => (
        <Pressable
          key={option.id}
          onPress={() => {
            onSelectOption(option);
          }}
          style={({ pressed }) => [
            styles.option,
            index === highlightedIndex ? styles.optionHighlighted : null,
            pressed ? styles.optionPressed : null,
          ]}
        >
          <Text style={styles.optionLabel}>{option.label}</Text>
          {option.secondaryLabel ? (
            <Text style={styles.optionSubLabel}>{option.secondaryLabel}</Text>
          ) : null}
        </Pressable>
      ))}

      {emptyState === 'noRecent' ? (
        <Text style={styles.emptyText}>No recent items yet.</Text>
      ) : null}

      {emptyState === 'noMatches' ? (
        <Text style={styles.emptyText}>No matches. Add as new.</Text>
      ) : null}

      {exactMatchOption && queryTrimmed.length > 0 ? (
        <Pressable
          onPress={() => {
            onSelectOption(exactMatchOption);
          }}
          style={({ pressed }) => [
            styles.useExisting,
            pressed ? styles.optionPressed : null,
          ]}
        >
          <Text
            style={styles.useExistingLabel}
          >{`Use existing "${exactMatchOption.label}"`}</Text>
        </Pressable>
      ) : null}

      {shouldShowQuickAdd ? (
        <Pressable
          disabled={isCreating}
          onPress={onQuickAddPress}
          style={({ pressed }) => [
            styles.quickAdd,
            pressed ? styles.optionPressed : null,
          ]}
        >
          <Text style={styles.quickAddLabel}>
            {isCreating
              ? `Saving ${createLabel}...`
              : `+ ${createLabel} "${queryTrimmed}"`}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    dropdown: {
      position: 'absolute',
      top: 46,
      left: 0,
      right: 0,
      zIndex: 5,
      elevation: 5,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
      maxHeight: 220,
      overflow: 'hidden',
    },
    sectionLabel: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      fontSize: typeScale.bodySm,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    option: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 2,
    },
    optionPressed: {
      backgroundColor: colors.accentMuted,
    },
    optionHighlighted: {
      backgroundColor: colors.accentMuted,
      borderLeftWidth: 2,
      borderLeftColor: colors.accent,
    },
    optionLabel: {
      fontSize: typeScale.body,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    optionSubLabel: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    quickAdd: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    quickAddLabel: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.accent,
    },
    useExisting: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    useExistingLabel: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    emptyText: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
  });
