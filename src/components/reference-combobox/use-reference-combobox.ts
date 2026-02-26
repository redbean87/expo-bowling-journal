import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, TextInput as RNTextInput } from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import {
  findExactReferenceOption,
  getReferenceComboboxEmptyState,
  moveReferenceHighlightIndex,
  shouldShowReferenceQuickAdd,
} from '@/utils/reference-combobox-utils';

type UseReferenceComboboxInput = {
  valueId: string | null;
  allOptions: ReferenceOption<string>[];
  recentOptions: ReferenceOption<string>[];
  onSelect: (option: ReferenceOption<string>) => void;
  onQuickAdd: (name: string) => Promise<ReferenceOption<string>>;
  getSuggestions: (
    allOptions: ReferenceOption<string>[],
    recentOptions: ReferenceOption<string>[],
    query: string
  ) => ReferenceOption<string>[];
};

export function useReferenceCombobox({
  valueId,
  allOptions,
  recentOptions,
  onSelect,
  onQuickAdd,
  getSuggestions,
}: UseReferenceComboboxInput) {
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

  const selectOption = (option: ReferenceOption<string>) => {
    setQuery(option.label);
    onSelect(option);
    closeDropdown();
  };

  const onInputKeyPress = (key: string) => {
    if (key === 'ArrowDown') {
      setHighlightedIndex((currentIndex) =>
        moveReferenceHighlightIndex(currentIndex, suggestions.length, 'next')
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

    if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
      const highlightedOption = suggestions[highlightedIndex];

      if (highlightedOption) {
        selectOption(highlightedOption);
      }
      return;
    }

    if (exactMatchOption) {
      selectOption(exactMatchOption);
    }
  };

  const onQuickAddPress = () => {
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

  return {
    inputRef,
    query,
    isOpen,
    highlightedIndex,
    isCreating,
    selected,
    suggestions,
    exactMatchOption,
    hasQuery,
    shouldShowQuickAdd,
    emptyState,
    dropdownAnimationStyle: {
      opacity: dropdownOpacity,
      transform: [{ translateY: dropdownTranslateY }],
    },
    openDropdown,
    closeDropdown,
    selectOption,
    onInputKeyPress,
    onQuickAddPress,
    onInputChange: (nextValue: string) => {
      setQuery(nextValue);
      openDropdown();
      setHighlightedIndex(-1);
    },
    displayValue: isOpen ? query : (selected?.label ?? query),
    queryTrimmed: query.trim(),
  };
}
