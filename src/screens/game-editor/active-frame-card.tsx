import { StyleSheet, Text, View } from 'react-native';

import { type RollField } from './game-editor-frame-utils';
import { PinDeck } from './pin-deck';

import { Button, Card } from '@/components/ui';
import { colors, radius, spacing, typeScale } from '@/theme/tokens';

const ROLL_LABELS: Record<RollField, string> = {
  roll1Mask: 'Roll 1',
  roll2Mask: 'Roll 2',
  roll3Mask: 'Roll 3',
};

type ActiveFrameCardProps = {
  frameIndex: number;
  activeField: RollField;
  visibleRollFields: RollField[];
  activeRollMask: number | null;
  activeStandingMask: number;
  autosaveMessage: string;
  autosaveState: 'idle' | 'saving' | 'saved' | 'error';
  inlineError: string | null;
  onSelectRoll: (field: RollField) => void;
  onTogglePin: (pinNumber: number) => void;
};

export function ActiveFrameCard({
  frameIndex,
  activeField,
  visibleRollFields,
  activeRollMask,
  activeStandingMask,
  autosaveMessage,
  autosaveState,
  inlineError,
  onSelectRoll,
  onTogglePin,
}: ActiveFrameCardProps) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Frame {frameIndex + 1}</Text>

      <View style={styles.rollTabs}>
        {visibleRollFields.map((field) => {
          const isActive = field === activeField;

          return (
            <Button
              key={`roll-tab-${field}`}
              label={ROLL_LABELS[field]}
              onPress={() => onSelectRoll(field)}
              variant={isActive ? 'primary' : 'secondary'}
            />
          );
        })}
      </View>

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
  rollTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
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
