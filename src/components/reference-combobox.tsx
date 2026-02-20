import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { Input } from '@/components/ui';
import { colors, spacing, typeScale } from '@/theme/tokens';

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

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

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
  const [isCreating, setIsCreating] = useState(false);
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
  const hasExactMatch = useMemo(() => {
    const normalizedQuery = normalizeName(query);

    if (normalizedQuery.length === 0) {
      return false;
    }

    return allOptions.some(
      (option) => normalizeName(option.label) === normalizedQuery
    );
  }, [allOptions, query]);
  const hasQuery = query.trim().length > 0;

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

  return (
    <View style={styles.container}>
      <View style={styles.inputShell}>
        <Input
          autoCapitalize="words"
          autoCorrect={false}
          onBlur={() => {
            setTimeout(() => setIsOpen(false), 120);
          }}
          onChangeText={(nextValue) => {
            setQuery(nextValue);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          value={isOpen ? query : (selected?.label ?? query)}
        />
        <Text style={styles.chevron}>v</Text>
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
          {suggestions.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => {
                setQuery(option.label);
                onSelect(option);
                setIsOpen(false);
              }}
              style={({ pressed }) => [
                styles.option,
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

          {suggestions.length === 0 ? (
            <Text style={styles.emptyText}>No matches yet.</Text>
          ) : null}

          {hasQuery ? (
            <Pressable
              disabled={isCreating}
              onPress={() => {
                void (async () => {
                  setIsCreating(true);

                  try {
                    const created = await onQuickAdd(query.trim());
                    setQuery(created.label);
                    onSelect(created);
                    setIsOpen(false);
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

          {hasExactMatch ? (
            <Text style={styles.hintText}>Existing match available.</Text>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  inputShell: {
    position: 'relative',
  },
  chevron: {
    position: 'absolute',
    right: spacing.sm,
    top: 11,
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
    pointerEvents: 'none',
  },
  dropdown: {
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
  emptyText: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
  },
  hintText: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
  },
});
