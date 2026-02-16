import { useMemo, useRef } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { colors, radius, spacing, typeScale } from '@/theme/tokens';

const PIN_ROWS = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]] as const;

function isPinSet(mask: number, pinNumber: number) {
  return (mask & (1 << (pinNumber - 1))) !== 0;
}

type PinDeckProps = {
  selectedMask: number;
  standingMask: number;
  availableHeight?: number;
  onSetPinKnocked: (pinNumber: number) => void;
  onSetPinStanding: (pinNumber: number) => void;
  onTogglePin: (pinNumber: number) => void;
};

type Point = {
  x: number;
  y: number;
};

type SwipeMode = 'knockDown' | 'pickUp';

type RowLayout = {
  x: number;
  y: number;
};

type PinLayout = {
  rowIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const SWIPE_START_THRESHOLD = 10;
const SWIPE_INTERPOLATION_STEP = 12;

function getPointFromEvent(event: GestureResponderEvent): Point {
  return {
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  };
}

function distanceBetween(left: Point, right: Point) {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function PinDeck({
  selectedMask,
  standingMask,
  availableHeight,
  onSetPinKnocked,
  onSetPinStanding,
  onTogglePin,
}: PinDeckProps) {
  const { width, height } = useWindowDimensions();
  const topRowWidth = useMemo(() => width - spacing.sm * 4, [width]);
  const deckHeight = useMemo(() => {
    const maxDeckHeight = 420;
    const minDeckHeight = 240;
    const fallbackHeight = Math.round(height * 0.46);
    const measuredHeight =
      typeof availableHeight === 'number' && availableHeight > 0
        ? Math.round(availableHeight - spacing.sm * 2)
        : fallbackHeight;

    return Math.min(maxDeckHeight, Math.max(minDeckHeight, measuredHeight));
  }, [availableHeight, height]);
  const slotWidth = topRowWidth / 4;
  const isWeb = Platform.OS === 'web';

  const rowLayoutsRef = useRef<Record<number, RowLayout>>({});
  const pinLayoutsRef = useRef<Record<number, PinLayout>>({});
  const swipeModeRef = useRef<SwipeMode | null>(null);
  const visitedPinsRef = useRef(new Set<number>());
  const isSwipeActiveRef = useRef(false);
  const swipeStartPointRef = useRef<Point | null>(null);
  const lastPointRef = useRef<Point | null>(null);

  const registerRowLayout = (rowIndex: number, event: LayoutChangeEvent) => {
    const { x, y } = event.nativeEvent.layout;
    rowLayoutsRef.current[rowIndex] = { x, y };
  };

  const registerPinLayout = (
    rowIndex: number,
    pinNumber: number,
    event: LayoutChangeEvent
  ) => {
    const {
      x,
      y,
      width: pinWidth,
      height: pinHeight,
    } = event.nativeEvent.layout;

    pinLayoutsRef.current[pinNumber] = {
      rowIndex,
      x,
      y,
      width: pinWidth,
      height: pinHeight,
    };
  };

  const findPinAtPoint = (point: Point) => {
    for (const row of PIN_ROWS) {
      for (const pinNumber of row) {
        const pinLayout = pinLayoutsRef.current[pinNumber];

        if (!pinLayout) {
          continue;
        }

        const rowLayout = rowLayoutsRef.current[pinLayout.rowIndex];

        if (!rowLayout) {
          continue;
        }

        const left = rowLayout.x + pinLayout.x;
        const top = rowLayout.y + pinLayout.y;
        const withinX = point.x >= left && point.x <= left + pinLayout.width;
        const withinY = point.y >= top && point.y <= top + pinLayout.height;

        if (withinX && withinY) {
          return pinNumber;
        }
      }
    }

    return null;
  };

  const applySwipePoint = (point: Point) => {
    const pinNumber = findPinAtPoint(point);

    if (pinNumber === null) {
      return;
    }

    if (!isPinSet(standingMask, pinNumber)) {
      return;
    }

    if (visitedPinsRef.current.has(pinNumber)) {
      return;
    }

    let swipeMode = swipeModeRef.current;

    if (!swipeMode) {
      swipeMode = isPinSet(selectedMask, pinNumber) ? 'pickUp' : 'knockDown';
      swipeModeRef.current = swipeMode;
    }

    if (swipeMode === 'knockDown') {
      onSetPinKnocked(pinNumber);
    } else {
      onSetPinStanding(pinNumber);
    }

    visitedPinsRef.current.add(pinNumber);
  };

  const applyInterpolatedSegment = (from: Point, to: Point) => {
    const distance = distanceBetween(from, to);
    const steps = Math.max(1, Math.ceil(distance / SWIPE_INTERPOLATION_STEP));

    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      applySwipePoint({
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      });
    }
  };

  const resetSwipeState = () => {
    swipeModeRef.current = null;
    visitedPinsRef.current.clear();
    isSwipeActiveRef.current = false;
    swipeStartPointRef.current = null;
    lastPointRef.current = null;
  };

  const onResponderGrant = (event: GestureResponderEvent) => {
    const point = getPointFromEvent(event);
    swipeStartPointRef.current = point;
    lastPointRef.current = point;
    isSwipeActiveRef.current = false;
    swipeModeRef.current = null;
    visitedPinsRef.current.clear();
  };

  const onResponderMove = (event: GestureResponderEvent) => {
    const point = getPointFromEvent(event);
    const startPoint = swipeStartPointRef.current;
    const previousPoint = lastPointRef.current;

    if (!startPoint) {
      swipeStartPointRef.current = point;
      lastPointRef.current = point;
      return;
    }

    if (!isSwipeActiveRef.current) {
      if (distanceBetween(startPoint, point) < SWIPE_START_THRESHOLD) {
        lastPointRef.current = point;
        return;
      }

      isSwipeActiveRef.current = true;
      applyInterpolatedSegment(startPoint, point);
      lastPointRef.current = point;
      return;
    }

    if (!previousPoint) {
      lastPointRef.current = point;
      return;
    }

    applyInterpolatedSegment(previousPoint, point);
    lastPointRef.current = point;
  };

  return (
    <View
      style={[styles.deck, { width: topRowWidth, height: deckHeight }]}
      onStartShouldSetResponder={isWeb ? () => false : undefined}
      onMoveShouldSetResponder={isWeb ? () => true : undefined}
      onResponderGrant={isWeb ? onResponderGrant : undefined}
      onResponderMove={isWeb ? onResponderMove : undefined}
      onResponderRelease={isWeb ? resetSwipeState : undefined}
      onResponderTerminate={isWeb ? resetSwipeState : undefined}
    >
      {PIN_ROWS.map((row, rowIndex) => (
        <View
          key={`pin-row-${rowIndex}`}
          onLayout={(event) => registerRowLayout(rowIndex, event)}
          style={[
            styles.row,
            row.length === 1 ? styles.rowSingle : styles.rowSpread,
            row.length === 3 ? { paddingHorizontal: slotWidth / 2 } : null,
            row.length === 2 ? { paddingHorizontal: slotWidth } : null,
          ]}
        >
          {row.map((pinNumber) => {
            const isStanding = isPinSet(standingMask, pinNumber);
            const isKnocked = isPinSet(selectedMask, pinNumber);

            return (
              <Pressable
                key={`pin-${pinNumber}`}
                onLayout={(event) =>
                  registerPinLayout(rowIndex, pinNumber, event)
                }
                disabled={!isStanding}
                onPress={() => {
                  if (isSwipeActiveRef.current) {
                    return;
                  }

                  onTogglePin(pinNumber);
                }}
                style={({ pressed }) => [
                  styles.pin,
                  !isStanding ? styles.pinDown : null,
                  isStanding && !isKnocked ? styles.pinStanding : null,
                  isStanding && isKnocked ? styles.pinKnocked : null,
                  pressed && isStanding ? styles.pinPressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.pinLabel,
                    !isStanding ? styles.pinLabelDown : null,
                    isStanding && !isKnocked ? styles.pinLabelStanding : null,
                    isStanding && isKnocked ? styles.pinLabelKnocked : null,
                  ]}
                >
                  {pinNumber}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    justifyContent: 'space-between',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  rowSpread: {
    justifyContent: 'space-between',
  },
  rowSingle: {
    justifyContent: 'center',
  },
  pin: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinStanding: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  pinKnocked: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  pinDown: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    opacity: 0.5,
  },
  pinPressed: {
    opacity: 0.82,
  },
  pinLabel: {
    fontSize: typeScale.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pinLabelDown: {
    color: colors.textSecondary,
  },
  pinLabelStanding: {
    color: colors.accentText,
  },
  pinLabelKnocked: {
    color: colors.textSecondary,
  },
});
