type OptionWithLabel = {
  id: string;
  label: string;
};

type HighlightDirection = 'next' | 'previous';

type ComboboxEmptyState = 'none' | 'noRecent' | 'noMatches';

export function normalizeReferenceQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findExactReferenceOption<TOption extends OptionWithLabel>(
  options: TOption[],
  query: string
) {
  const normalizedQuery = normalizeReferenceQuery(query);

  if (normalizedQuery.length === 0) {
    return null;
  }

  return (
    options.find(
      (option) => normalizeReferenceQuery(option.label) === normalizedQuery
    ) ?? null
  );
}

export function buildRankedReferenceSuggestions<
  TOption extends OptionWithLabel,
>(options: TOption[], recentOptions: TOption[], query: string, limit = 10) {
  const normalizedQuery = normalizeReferenceQuery(query);

  if (normalizedQuery.length === 0) {
    const seenIds = new Set<string>();
    const merged: TOption[] = [];

    for (const option of recentOptions) {
      if (seenIds.has(option.id)) {
        continue;
      }

      seenIds.add(option.id);
      merged.push(option);

      if (merged.length >= limit) {
        return merged;
      }
    }

    for (const option of options) {
      if (seenIds.has(option.id)) {
        continue;
      }

      seenIds.add(option.id);
      merged.push(option);

      if (merged.length >= limit) {
        return merged;
      }
    }

    return merged;
  }

  const exactMatches: TOption[] = [];
  const prefixMatches: TOption[] = [];
  const containsMatches: TOption[] = [];

  options.forEach((option) => {
    const normalizedLabel = normalizeReferenceQuery(option.label);

    if (normalizedLabel === normalizedQuery) {
      exactMatches.push(option);
      return;
    }

    if (normalizedLabel.startsWith(normalizedQuery)) {
      prefixMatches.push(option);
      return;
    }

    if (normalizedLabel.includes(normalizedQuery)) {
      containsMatches.push(option);
    }
  });

  return [...exactMatches, ...prefixMatches, ...containsMatches].slice(
    0,
    limit
  );
}

export function getReferenceComboboxEmptyState(
  query: string,
  suggestionCount: number
): ComboboxEmptyState {
  if (suggestionCount > 0) {
    return 'none';
  }

  return query.trim().length > 0 ? 'noMatches' : 'noRecent';
}

export function shouldShowReferenceQuickAdd(
  query: string,
  hasExactMatch: boolean
) {
  return query.trim().length > 0 && !hasExactMatch;
}

export function moveReferenceHighlightIndex(
  currentIndex: number,
  itemCount: number,
  direction: HighlightDirection
) {
  if (itemCount <= 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return direction === 'next' ? 0 : itemCount - 1;
  }

  if (direction === 'next') {
    return (currentIndex + 1) % itemCount;
  }

  return (currentIndex - 1 + itemCount) % itemCount;
}

export type { ComboboxEmptyState, OptionWithLabel };
