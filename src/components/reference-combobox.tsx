import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ReferenceComboboxDropdown } from './reference-combobox/reference-combobox-dropdown';
import { useReferenceCombobox } from './reference-combobox/use-reference-combobox';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { Input } from '@/components/ui';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    inputRef,
    displayValue,
    isOpen,
    hasQuery,
    suggestions,
    highlightedIndex,
    emptyState,
    exactMatchOption,
    queryTrimmed,
    shouldShowQuickAdd,
    isCreating,
    dropdownAnimationStyle,
    selectOption,
    onQuickAddPress,
    closeDropdown,
    openDropdown,
    onInputChange,
    onInputKeyPress,
  } = useReferenceCombobox({
    valueId,
    allOptions,
    recentOptions,
    onSelect,
    onQuickAdd,
    getSuggestions,
  });

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
          onChangeText={onInputChange}
          onFocus={() => openDropdown()}
          onKeyPress={(event) => {
            onInputKeyPress(event.nativeEvent.key);
          }}
          placeholder={placeholder}
          value={displayValue}
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
        <ReferenceComboboxDropdown
          hasQuery={hasQuery}
          suggestions={suggestions}
          highlightedIndex={highlightedIndex}
          emptyState={emptyState}
          exactMatchOption={exactMatchOption}
          queryTrimmed={queryTrimmed}
          shouldShowQuickAdd={shouldShowQuickAdd}
          isCreating={isCreating}
          createLabel={createLabel}
          dropdownAnimationStyle={dropdownAnimationStyle}
          onSelectOption={selectOption}
          onQuickAddPress={onQuickAddPress}
        />
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    optionPressed: {
      backgroundColor: colors.accentMuted,
    },
  });
