import { StyleSheet, Text, View } from 'react-native';

import { PinDeck } from './pin-deck';

import { Card } from '@/components/ui';
import { colors, radius, spacing, typeScale } from '@/theme/tokens';

type ActiveFrameCardProps = {
  frameIndex: number;
  activeRollMask: number | null;
  activeStandingMask: number;
  autosaveMessage: string;
  autosaveState: 'idle' | 'saving' | 'saved' | 'error';
  inlineError: string | null;
  onTogglePin: (pinNumber: number) => void;
};

export function ActiveFrameCard({
  frameIndex,
  activeRollMask,
  activeStandingMask,
  autosaveMessage,
  autosaveState,
  inlineError,
  onTogglePin,
}: ActiveFrameCardProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Frame {frameIndex + 1}</Text>

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
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  title: {
    fontSize: typeScale.titleSm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  autosaveText: {
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
