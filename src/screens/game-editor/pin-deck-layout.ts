import { spacing } from '@/theme/tokens';

export const PIN_ROWS = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]] as const;

export function isPinSet(mask: number, pinNumber: number) {
  return (mask & (1 << (pinNumber - 1))) !== 0;
}

export function getPinDeckDimensions(args: {
  windowWidth: number;
  windowHeight: number;
  availableHeight?: number;
}) {
  const { windowWidth, windowHeight, availableHeight } = args;
  const topRowWidth = windowWidth - spacing.sm * 4;
  const maxDeckHeight = 380;
  const minDeckHeight = 220;
  const fallbackHeight = Math.round(windowHeight * 0.42);
  const measuredHeight =
    typeof availableHeight === 'number' && availableHeight > 0
      ? Math.round(availableHeight - spacing.sm * 2)
      : fallbackHeight;
  const deckHeight = Math.min(
    maxDeckHeight,
    Math.max(minDeckHeight, measuredHeight)
  );

  return {
    topRowWidth,
    deckHeight,
    slotWidth: topRowWidth / 4,
  };
}
