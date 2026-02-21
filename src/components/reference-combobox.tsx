import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { Input } from '@/components/ui';
import { colors, spacing, typeScale } from '@/theme/tokens';
import {
  findExactReferenceOption,
  getReferenceComboboxEmptyState,
  moveReferenceHighlightIndex,
  shouldShowReferenceQuickAdd,
} from '@/utils/reference-combobox-utils';

type ReferenceComboboxProps = {
  valueId: string | null;
  allOptions: ReferenceOption<string>[];
  recentOptions: ReferenceOption<string>[];
  placeholder: string;
  createLabel: string;
  onSelect: (option: ReferenceOption<string>) => void;
  onQuickAdd: (name: string) => Promise<ReferenceOption<string>>;
  getSuggestions: (
    allOptions: ReferenceOption<string>[],
    recentOptions: ReferenceOption<string>[],
    query: string
  ) => ReferenceOption<string>[];
};

export function ReferenceCombobox({
  valueId,
  allOptions,
  recentOptions,
  placeholder,
  createLabel,
  onSelect,
  onQuickAdd,
  getSuggestions,
}: ReferenceComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<RNTextInput>(null);
  const dropdownOpacity = useRef(new Animated.Value(0)).current;
  const dropdownTranslateY = useRef(new Animated.Value(-4)).current;

  const selected = useMemo(
    () => allOptions.find((option) => option.id === valueId) ?? null,
    [allOptions, valueId]
  );
  const suggestions = useMemo(
    () => getSuggestions(allOptions, recentOptions, query),
    [allOptions, getSuggestions, query, recentOptions]
  );
  const exactMatchOption = useMemo(
    () => findExactReferenceOption(allOptions, query),
    [allOptions, query]
  );
  const hasExactMatch = exactMatchOption !== null;
  const hasQuery = query.trim().length > 0;
  const shouldShowQuickAdd = shouldShowReferenceQuickAdd(query, hasExactMatch);
  const emptyState = getReferenceComboboxEmptyState(query, suggestions.length);

  const selectOption = (option: ReferenceOption<string>) => {
    setQuery(option.label);
    onSelect(option);
    closeDropdown();
  };

  const closeDropdown = (shouldBlur = false) => {
    setIsOpen(false);
    setHighlightedIndex(-1);

    if (shouldBlur) {
      inputRef.current?.blur();
    }
  };

  const openDropdown = (shouldFocus = false) => {
    setIsOpen(true);

    if (shouldFocus) {
      inputRef.current?.focus();
    }
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(dropdownOpacity, {
        toValue: isOpen ? 1 : 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(dropdownTranslateY, {
        toValue: isOpen ? 0 : -4,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dropdownOpacity, dropdownTranslateY, isOpen]);

  useEffect(() => {
    if (!isOpen || suggestions.length === 0) {
      setHighlightedIndex(-1);
      return;
    }

    if (highlightedIndex >= suggestions.length) {
      setHighlightedIndex(suggestions.length - 1);
    }
  }, [highlightedIndex, isOpen, suggestions.length]);

  return (
    <View style={[styles.container, isOpen ? styles.containerOpen : null]}>
      <View style={styles.inputShell}>
        <Input
          ref={inputRef}
          autoCapitalize="words"
          autoCorrect={false}
          onBlur={() => {
            setTimeout(() => closeDropdown(), 120);
          }}
          onChangeText={(nextValue) => {
            setQuery(nextValue);
            openDropdown();
            setHighlightedIndex(-1);
          }}
          onFocus={() => openDropdown()}
          onKeyPress={(event) => {
            const { key } = event.nativeEvent;

            if (key === 'ArrowDown') {
              setHighlightedIndex((currentIndex) =>
                moveReferenceHighlightIndex(
                  currentIndex,
                  suggestions.length,
                  'next'
                )
              );
              return;
            }

            if (key === 'ArrowUp') {
              setHighlightedIndex((currentIndex) =>
                moveReferenceHighlightIndex(
                  currentIndex,
                  suggestions.length,
                  'previous'
                )
              );
              return;
            }

            if (key === 'Escape') {
              closeDropdown(true);
              return;
            }

            if (key !== 'Enter') {
              return;
            }

            if (
              highlightedIndex >= 0 &&
              highlightedIndex < suggestions.length
            ) {
              selectOption(suggestions[highlightedIndex]);
              return;
            }

            if (exactMatchOption) {
              selectOption(exactMatchOption);
            }
          }}
          placeholder={placeholder}
          value={isOpen ? query : (selected?.label ?? query)}
        />
        <Pressable
          accessibilityLabel={isOpen ? 'Close options' : 'Open options'}
          hitSlop={8}
          onPress={() => {
            if (isOpen) {
              closeDropdown(true);
              return;
            }

            openDropdown(true);
          }}
          style={({ pressed }) => [
            styles.chevronButton,
            pressed ? styles.optionPressed : null,
          ]}
        >
          <Text style={styles.chevron}>{isOpen ? '^' : 'v'}</Text>
        </Pressable>
      </View>

      {isOpen ? (
        <Animated.View
          style={[
            styles.dropdown,
            {
              opacity: dropdownOpacity,
              transform: [{ translateY: dropdownTranslateY }],
            },
          ]}
        >
          <Text style={styles.sectionLabel}>
            {hasQuery ? 'Matches' : 'Recent'}
          </Text>
          {suggestions.map((option, index) => (
            <Pressable
              key={option.id}
              onPress={() => {
                selectOption(option);
              }}
              style={({ pressed }) => [
                styles.option,
                index === highlightedIndex ? styles.optionHighlighted : null,
                pressed ? styles.optionPressed : null,
              ]}
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
              {option.secondaryLabel ? (
                <Text style={styles.optionSubLabel}>
                  {option.secondaryLabel}
                </Text>
              ) : null}
            </Pressable>
          ))}

          {emptyState === 'noRecent' ? (
            <Text style={styles.emptyText}>No recent items yet.</Text>
          ) : null}

          {emptyState === 'noMatches' ? (
            <Text style={styles.emptyText}>No matches. Add as new.</Text>
          ) : null}

          {exactMatchOption && query.trim().length > 0 ? (
            <Pressable
              onPress={() => {
                selectOption(exactMatchOption);
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
              onPress={() => {
                void (async () => {
                  setIsCreating(true);

                  try {
                    const created = await onQuickAdd(query.trim());
                    setQuery(created.label);
                    onSelect(created);
                    closeDropdown();
                  } finally {
                    setIsCreating(false);
                  }
                })();
              }}
              style={({ pressed }) => [
                styles.quickAdd,
                pressed ? styles.optionPressed : null,
              ]}
            >
              <Text style={styles.quickAddLabel}>
                {isCreating
                  ? `Saving ${createLabel}...`
                  : `+ ${createLabel} "${query.trim()}"`}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  containerOpen: {
    zIndex: 20,
  },
  inputShell: {
    position: 'relative',
    zIndex: 2,
  },
  chevronButton: {
    position: 'absolute',
    right: spacing.xs,
    top: 7,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  chevron: {
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
  },
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
