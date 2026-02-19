import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PinDeck } from './pin-deck';

import { colors, radius, spacing, typeScale } from '@/theme/tokens';

type ActiveFrameCardProps = {
  activeRollMask: number | null;
  activeStandingMask: number;
  autosaveMessage: string;
  autosaveState:
    | 'idle'
    | 'saving'
    | 'saved'
    | 'queued'
    | 'syncingQueued'
    | 'error';
  inlineError: string | null;
  onSetPinKnocked: (pinNumber: number) => void;
  onSetPinStanding: (pinNumber: number) => void;
  onTogglePin: (pinNumber: number) => void;
};

export function ActiveFrameCard({
  activeRollMask,
  activeStandingMask,
  autosaveMessage,
  autosaveState,
  inlineError,
  onSetPinKnocked,
  onSetPinStanding,
  onTogglePin,
}: ActiveFrameCardProps) {
  const [deckAreaHeight, setDeckAreaHeight] = useState(0);

  return (
    <View style={styles.container}>
      <View
        style={styles.deckArea}
        onLayout={(event) => {
          setDeckAreaHeight(event.nativeEvent.layout.height);
        }}
      >
        <PinDeck
          selectedMask={activeRollMask ?? 0}
          standingMask={activeStandingMask}
          availableHeight={deckAreaHeight}
          onSetPinKnocked={onSetPinKnocked}
          onSetPinStanding={onSetPinStanding}
          onTogglePin={onTogglePin}
        />

        {autosaveMessage ? (
          <View pointerEvents="none" style={styles.autosaveOverlay}>
            <Text
              style={[
                styles.autosaveText,
                autosaveState === 'error' ? styles.autosaveTextError : null,
              ]}
            >
              {autosaveMessage}
            </Text>
          </View>
        ) : null}
      </View>

      {inlineError ? (
        <View style={styles.inlineErrorContainer}>
          <Text style={styles.inlineError}>{inlineError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'flex-start',
  },
  deckArea: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  autosaveOverlay: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
  },
  autosaveText: {
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
    opacity: 0.62,
  },
  autosaveTextError: {
    color: colors.danger,
  },
  inlineErrorContainer: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  inlineError: {
    color: colors.danger,
    fontSize: typeScale.bodySm,
  },
});
