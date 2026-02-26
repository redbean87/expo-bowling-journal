import { useRef } from 'react';

import { PIN_ROWS, isPinSet } from './pin-deck-layout';

import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';

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

type UsePinDeckGestureInput = {
  selectedMask: number;
  standingMask: number;
  onSetPinKnocked: (pinNumber: number) => void;
  onSetPinStanding: (pinNumber: number) => void;
};

export function usePinDeckGesture({
  selectedMask,
  standingMask,
  onSetPinKnocked,
  onSetPinStanding,
}: UsePinDeckGestureInput) {
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

  return {
    registerRowLayout,
    registerPinLayout,
    onResponderGrant,
    onResponderMove,
    resetSwipeState,
    isSwipeActiveRef,
  };
}
