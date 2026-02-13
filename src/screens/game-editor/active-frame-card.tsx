import { StyleSheet, Text, View } from 'react-native';

import { getRollValue, type RollField } from './game-editor-frame-utils';
import { PinDeck } from './pin-deck';

import { Button, Card } from '@/components/ui';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

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
  inlineError: string | null;
  onSelectRoll: (field: RollField) => void;
  onTogglePin: (pinNumber: number) => void;
  onSetGutter: () => void;
  onSetFullRack: () => void;
  onClearRoll: () => void;
  onClearFrame: () => void;
  onCommitRoll: () => void;
  commitLabel: string;
};

export function ActiveFrameCard({
  frameIndex,
  activeField,
  visibleRollFields,
  activeRollMask,
  activeStandingMask,
  inlineError,
  onSelectRoll,
  onTogglePin,
  onSetGutter,
  onSetFullRack,
  onClearRoll,
  onClearFrame,
  onCommitRoll,
  commitLabel,
}: ActiveFrameCardProps) {
  const selectedCount = getRollValue(activeRollMask) ?? 0;

  return (
    <Card>
      <Text style={styles.title}>Frame {frameIndex + 1}</Text>
      <Text style={styles.caption}>
        Roll 1 starts all knocked. Fresh-rack bonus rolls do too.
      </Text>

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

      <Text style={styles.countText}>
        Pins knocked this roll: {selectedCount}
      </Text>

      <PinDeck
        selectedMask={activeRollMask ?? 0}
        standingMask={activeStandingMask}
        onTogglePin={onTogglePin}
      />

      <View style={styles.quickActions}>
        <Button label="Gutter" onPress={onSetGutter} variant="secondary" />
        <Button label="All pins" onPress={onSetFullRack} variant="secondary" />
      </View>

      <View style={styles.quickActions}>
        <Button label="Clear roll" onPress={onClearRoll} variant="ghost" />
        <Button label="Clear frame" onPress={onClearFrame} variant="ghost" />
      </View>

      <Button label={commitLabel} onPress={onCommitRoll} />

      {inlineError ? (
        <Text style={styles.inlineError}>{inlineError}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typeScale.titleSm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  caption: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
  rollTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countText: {
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inlineError: {
    color: colors.danger,
    fontSize: typeScale.bodySm,
  },
});
