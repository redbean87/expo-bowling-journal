import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRankedReferenceSuggestions,
  findExactReferenceOption,
  getReferenceComboboxEmptyState,
  moveReferenceHighlightIndex,
  shouldShowReferenceQuickAdd,
} from '../src/utils/reference-combobox-utils';

type Option = {
  id: string;
  label: string;
};

test('buildRankedReferenceSuggestions fills empty query with recent then all options', () => {
  const options: Option[] = [
    { id: 'a1', label: 'A' },
    { id: 'a2', label: 'B' },
    { id: 'a3', label: 'C' },
    { id: 'a4', label: 'D' },
  ];
  const recent: Option[] = [
    { id: 'r1', label: 'Zen 25' },
    { id: 'r2', label: 'Hy-Road' },
  ];

  const suggestions = buildRankedReferenceSuggestions(options, recent, '   ');

  assert.deepEqual(
    suggestions.map((option) => option.id),
    ['r1', 'r2', 'a1', 'a2', 'a3', 'a4']
  );
});

test('buildRankedReferenceSuggestions dedupes and caps empty-query suggestions', () => {
  const options: Option[] = Array.from({ length: 15 }, (_, index) => ({
    id: `o${index + 1}`,
    label: `Option ${index + 1}`,
  }));
  const recent: Option[] = [
    { id: 'o2', label: 'Option 2' },
    { id: 'o5', label: 'Option 5' },
    { id: 'o1', label: 'Option 1' },
  ];

  const suggestions = buildRankedReferenceSuggestions(options, recent, '');

  assert.equal(suggestions.length, 10);
  assert.deepEqual(
    suggestions.map((option) => option.id),
    ['o2', 'o5', 'o1', 'o3', 'o4', 'o6', 'o7', 'o8', 'o9', 'o10']
  );
});

test('buildRankedReferenceSuggestions prioritizes exact and prefix before contains', () => {
  const options: Option[] = [
    { id: '1', label: 'Alpha Ball' },
    { id: '2', label: 'My Alpha Ball' },
    { id: '3', label: 'alpha' },
    { id: '4', label: 'Alphabet Soup' },
  ];

  const suggestions = buildRankedReferenceSuggestions(options, [], ' alpha ');

  assert.deepEqual(
    suggestions.map((option) => option.id),
    ['3', '1', '4', '2']
  );
});

test('findExactReferenceOption returns exact normalized match', () => {
  const options: Option[] = [
    { id: '1', label: 'House Shot' },
    { id: '2', label: 'Sport Pattern' },
  ];

  const exact = findExactReferenceOption(options, '  house    shot ');

  assert.equal(exact?.id, '1');
});

test('shouldShowReferenceQuickAdd hides quick add when exact match exists', () => {
  assert.equal(shouldShowReferenceQuickAdd('phaze ii', true), false);
  assert.equal(shouldShowReferenceQuickAdd('phaze ii', false), true);
  assert.equal(shouldShowReferenceQuickAdd('   ', false), false);
});

test('getReferenceComboboxEmptyState distinguishes no recent from no matches', () => {
  assert.equal(getReferenceComboboxEmptyState('', 0), 'noRecent');
  assert.equal(getReferenceComboboxEmptyState('phase', 0), 'noMatches');
  assert.equal(getReferenceComboboxEmptyState('phase', 2), 'none');
});

test('moveReferenceHighlightIndex wraps correctly in both directions', () => {
  assert.equal(moveReferenceHighlightIndex(-1, 3, 'next'), 0);
  assert.equal(moveReferenceHighlightIndex(-1, 3, 'previous'), 2);
  assert.equal(moveReferenceHighlightIndex(2, 3, 'next'), 0);
  assert.equal(moveReferenceHighlightIndex(0, 3, 'previous'), 2);
  assert.equal(moveReferenceHighlightIndex(0, 0, 'next'), -1);
});
