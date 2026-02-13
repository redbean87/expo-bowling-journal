import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '@/theme/tokens';

const PIN_ROWS = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]] as const;

function isPinSet(mask: number, pinNumber: number) {
  return (mask & (1 << (pinNumber - 1))) !== 0;
}

type PinDeckProps = {
  selectedMask: number;
  standingMask: number;
  onTogglePin: (pinNumber: number) => void;
};

export function PinDeck({
  selectedMask,
  standingMask,
  onTogglePin,
}: PinDeckProps) {
  return (
    <View style={styles.deck}>
      {PIN_ROWS.map((row, rowIndex) => (
        <View key={`pin-row-${rowIndex}`} style={styles.row}>
          {row.map((pinNumber) => {
            const isStanding = isPinSet(standingMask, pinNumber);
            const isKnocked = isPinSet(selectedMask, pinNumber);

            return (
              <Pressable
                key={`pin-${pinNumber}`}
                disabled={!isStanding}
                onPress={() => onTogglePin(pinNumber)}
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
    gap: spacing.sm,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pin: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinStanding: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  pinKnocked: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  pinDown: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    opacity: 0.55,
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
