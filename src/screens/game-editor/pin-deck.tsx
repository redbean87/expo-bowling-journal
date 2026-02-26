import { useMemo } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { getPinDeckDimensions, isPinSet, PIN_ROWS } from './pin-deck-layout';
import { usePinDeckGesture } from './use-pin-deck-gesture';

import { colors, radius, typeScale } from '@/theme/tokens';

type PinDeckProps = {
  selectedMask: number;
  standingMask: number;
  availableHeight?: number;
  onSetPinKnocked: (pinNumber: number) => void;
  onSetPinStanding: (pinNumber: number) => void;
  onTogglePin: (pinNumber: number) => void;
};

export function PinDeck({
  selectedMask,
  standingMask,
  availableHeight,
  onSetPinKnocked,
  onSetPinStanding,
  onTogglePin,
}: PinDeckProps) {
  const { width, height } = useWindowDimensions();
  const { topRowWidth, deckHeight, slotWidth } = useMemo(
    () =>
      getPinDeckDimensions({
        windowWidth: width,
        windowHeight: height,
        availableHeight,
      }),
    [availableHeight, height, width]
  );
  const isWeb = Platform.OS === 'web';
  const {
    registerRowLayout,
    registerPinLayout,
    onResponderGrant,
    onResponderMove,
    resetSwipeState,
    isSwipeActiveRef,
  } = usePinDeckGesture({
    selectedMask,
    standingMask,
    onSetPinKnocked,
    onSetPinStanding,
  });

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
