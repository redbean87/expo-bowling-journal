import { StyleSheet, Text, View } from 'react-native';

import { PinDeck } from './pin-deck';

import { colors, radius, spacing, typeScale } from '@/theme/tokens';

type ActiveFrameCardProps = {
  activeRollMask: number | null;
  activeStandingMask: number;
  autosaveMessage: string;
  autosaveState: 'idle' | 'saving' | 'saved' | 'error';
  inlineError: string | null;
  tenthFrameHint: string | null;
  onTogglePin: (pinNumber: number) => void;
};

export function ActiveFrameCard({
  activeRollMask,
  activeStandingMask,
  autosaveMessage,
  autosaveState,
  inlineError,
  tenthFrameHint,
  onTogglePin,
}: ActiveFrameCardProps) {
  return (
    <View style={styles.container}>
      {tenthFrameHint ? (
        <Text style={styles.tenthFrameHint}>{tenthFrameHint}</Text>
      ) : null}

      <View style={styles.deckArea}>
        <PinDeck
          selectedMask={activeRollMask ?? 0}
          standingMask={activeStandingMask}
          onTogglePin={onTogglePin}
        />
      </View>

      {autosaveMessage ? (
        <Text
          style={[
            styles.autosaveText,
            autosaveState === 'error' ? styles.autosaveTextError : null,
          ]}
        >
          {autosaveMessage}
        </Text>
      ) : null}

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
  },
  autosaveText: {
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
  },
  tenthFrameHint: {
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
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
