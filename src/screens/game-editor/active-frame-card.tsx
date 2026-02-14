import { StyleSheet, Text, View } from 'react-native';

import { PinDeck } from './pin-deck';

import { Card } from '@/components/ui';
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
    <Card style={styles.card}>
      {tenthFrameHint ? (
        <Text style={styles.tenthFrameHint}>{tenthFrameHint}</Text>
      ) : null}

      <PinDeck
        selectedMask={activeRollMask ?? 0}
        standingMask={activeStandingMask}
        onTogglePin={onTogglePin}
      />

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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    gap: spacing.xs,
    justifyContent: 'flex-start',
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
