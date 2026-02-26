import { getRollValue, type FrameDraft } from './frame-mask-utils';

function getRollSymbol(value: number): string {
  if (value === 0) {
    return '-';
  }

  return String(value);
}

function getStandardFrameSymbolParts(frame: FrameDraft): string[] {
  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);

  if (roll1 === null) {
    return [];
  }

  if (roll1 === 10) {
    return ['X'];
  }

  if (roll2 === null) {
    return [getRollSymbol(roll1)];
  }

  const secondSymbol = roll1 + roll2 === 10 ? '/' : getRollSymbol(roll2);

  return [getRollSymbol(roll1), secondSymbol];
}

function getTenthFrameSymbolParts(frame: FrameDraft): string[] {
  const roll1 = getRollValue(frame.roll1Mask);
  const roll2 = getRollValue(frame.roll2Mask);
  const roll3 = getRollValue(frame.roll3Mask);

  if (roll1 === null) {
    return [];
  }

  const symbols: string[] = [roll1 === 10 ? 'X' : getRollSymbol(roll1)];

  if (roll2 === null) {
    return symbols;
  }

  if (roll1 === 10) {
    symbols.push(roll2 === 10 ? 'X' : getRollSymbol(roll2));
  } else {
    symbols.push(roll1 + roll2 === 10 ? '/' : getRollSymbol(roll2));
  }

  if (roll3 === null) {
    return symbols;
  }

  if (roll1 === 10) {
    if (roll2 === 10) {
      symbols.push(roll3 === 10 ? 'X' : getRollSymbol(roll3));
    } else {
      symbols.push(roll2 + roll3 === 10 ? '/' : getRollSymbol(roll3));
    }
  } else if (roll1 + roll2 === 10) {
    symbols.push(roll3 === 10 ? 'X' : getRollSymbol(roll3));
  } else {
    symbols.push(getRollSymbol(roll3));
  }

  return symbols;
}

export function getFrameSymbolParts(
  frameIndex: number,
  frame: FrameDraft
): string[] {
  if (frameIndex < 9) {
    return getStandardFrameSymbolParts(frame);
  }

  return getTenthFrameSymbolParts(frame);
}

export function getFrameSymbolSummary(
  frameIndex: number,
  frame: FrameDraft
): string {
  return getFrameSymbolParts(frameIndex, frame).join('');
}
