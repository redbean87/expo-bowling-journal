import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { colors, spacing, typeScale } from '@/theme/tokens';

type GameEditorFooterActionsProps = {
  shouldShowCompletionActions: boolean;
  shouldPreferFinishAction: boolean;
  canNavigateSessionFlows: boolean;
  shortcutLabel: string;
  onGoToGames: () => void;
  onGoToNextGame: () => void;
  onSetFullRack: () => void;
  onCommitRoll: () => void;
};

export function GameEditorFooterActions({
  shouldShowCompletionActions,
  shouldPreferFinishAction,
  canNavigateSessionFlows,
  shortcutLabel,
  onGoToGames,
  onGoToNextGame,
  onSetFullRack,
  onCommitRoll,
}: GameEditorFooterActionsProps) {
  const completionSecondaryLabel = shouldPreferFinishAction
    ? 'New game'
    : 'Games';
  const completionSecondaryAction = shouldPreferFinishAction
    ? onGoToNextGame
    : onGoToGames;
  const completionPrimaryLabel = shouldPreferFinishAction
    ? 'Finish'
    : 'Next game';
  const completionPrimaryAction = shouldPreferFinishAction
    ? onGoToGames
    : onGoToNextGame;

  return (
    <View style={styles.actionsFooter}>
      <View style={styles.actionsRow}>
        <View style={styles.stickyActionButton}>
          {shouldShowCompletionActions ? (
            <Button
              disabled={!canNavigateSessionFlows}
              label={completionSecondaryLabel}
              onPress={completionSecondaryAction}
              size="lg"
              variant="secondary"
            />
          ) : (
            <Pressable
              onPress={onSetFullRack}
              style={({ pressed }) => [
                styles.strikeButton,
                pressed ? styles.strikeButtonPressed : null,
              ]}
            >
              <Text style={styles.strikeButtonLabel}>{shortcutLabel}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.stickyActionButton}>
          {shouldShowCompletionActions ? (
            <Button
              disabled={!canNavigateSessionFlows}
              label={completionPrimaryLabel}
              onPress={completionPrimaryAction}
              size="lg"
            />
          ) : (
            <Button label="Next" onPress={onCommitRoll} size="lg" />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stickyActionButton: {
    flex: 1,
  },
  strikeButton: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  strikeButtonPressed: {
    opacity: 0.82,
  },
  strikeButtonLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.accent,
  },
});
