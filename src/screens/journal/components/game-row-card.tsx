import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

type PreviewItem = {
  text: string;
  hasSplit: boolean;
};

type DisplayGameItem = {
  key: string;
  routeGameId: string;
  routeDraftNonce: string | null;
  deleteGameId: string | null;
  deleteQueueId: string | null;
  totalScore: number;
  strikes: number;
  spares: number;
  opens: number;
  framePreviewItems: PreviewItem[];
};

type GameRowCardProps = {
  game: DisplayGameItem;
  gameLabel: string;
  deleteDisabled: boolean;
  onOpenEditor: (gameId: string, draftNonce: string | null) => void;
  onOpenActions: (target: {
    gameId: string | null;
    queueId: string | null;
    label: string;
    title: string;
  }) => void;
};

export function GameRowCard({
  game,
  gameLabel,
  deleteDisabled,
  onOpenEditor,
  onOpenActions,
}: GameRowCardProps) {
  const framePreviewItems = game.framePreviewItems;
  const previewRowOne = Array.from(
    { length: 5 },
    (_, slotIndex) => framePreviewItems[slotIndex] ?? null
  );
  const previewRowTwo = Array.from(
    { length: 5 },
    (_, slotIndex) => framePreviewItems[slotIndex + 5] ?? null
  );

  return (
    <Card style={styles.rowCard}>
      <View style={styles.rowHeader}>
        <Pressable
          style={({ pressed }) => [
            styles.gameHeaderContent,
            pressed ? styles.rowPressed : null,
          ]}
          onPress={() => onOpenEditor(game.routeGameId, game.routeDraftNonce)}
        >
          <Text style={styles.rowTitle}>
            {gameLabel} - {game.totalScore}
          </Text>
          <Text
            style={styles.meta}
          >{`Strikes ${String(game.strikes)} | Spares ${String(game.spares)} | Opens ${String(game.opens)}`}</Text>
        </Pressable>

        <Pressable
          accessibilityLabel={`Game actions for ${gameLabel}`}
          disabled={deleteDisabled}
          hitSlop={8}
          onPress={() =>
            onOpenActions({
              gameId: game.deleteGameId,
              queueId: game.deleteQueueId,
              label: gameLabel,
              title: `${gameLabel} - ${game.totalScore}`,
            })
          }
          style={({ pressed }) => [
            styles.menuButton,
            pressed ? styles.menuButtonPressed : null,
          ]}
        >
          <MaterialIcons
            name="more-vert"
            size={22}
            color={colors.textPrimary}
          />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.gameContent,
          pressed ? styles.rowPressed : null,
        ]}
        onPress={() => onOpenEditor(game.routeGameId, game.routeDraftNonce)}
      >
        {framePreviewItems.length > 0 ? (
          <View style={styles.previewGrid}>
            <View style={styles.previewRow}>
              {previewRowOne.map((item, itemIndex) => (
                <View
                  key={`${game.key}-row-1-${String(itemIndex)}`}
                  style={[
                    styles.previewChip,
                    item === null ? styles.previewChipPlaceholder : null,
                    item?.hasSplit ? styles.previewChipSplit : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.previewChipText,
                      item === null ? styles.previewChipPlaceholderText : null,
                      item?.hasSplit ? styles.previewChipTextSplit : null,
                    ]}
                  >
                    {item?.text ?? '-'}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.previewRow}>
              {previewRowTwo.map((item, itemIndex) => (
                <View
                  key={`${game.key}-row-2-${String(itemIndex)}`}
                  style={[
                    styles.previewChip,
                    item === null ? styles.previewChipPlaceholder : null,
                    item?.hasSplit ? styles.previewChipSplit : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.previewChipText,
                      item === null ? styles.previewChipPlaceholderText : null,
                      item?.hasSplit ? styles.previewChipTextSplit : null,
                    ]}
                  >
                    {item?.text ?? '-'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={styles.previewUnavailableText}>
            Frame-by-frame preview unavailable
          </Text>
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  rowTitle: {
    fontSize: typeScale.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowPressed: {
    opacity: 0.82,
  },
  rowHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  gameHeaderContent: {
    flex: 1,
  },
  gameContent: {
    flex: 1,
    marginTop: 0,
  },
  menuButton: {
    width: 40,
    height: 36,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  menuButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  meta: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
  previewGrid: {
    gap: spacing.xs,
    marginTop: 0,
  },
  previewRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  previewChip: {
    flex: 1,
    minHeight: 30,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewChipPlaceholder: {
    backgroundColor: colors.surfaceSubtle,
  },
  previewChipSplit: {
    borderColor: '#E8C5C2',
    backgroundColor: '#FEF5F4',
  },
  previewChipText: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  previewChipPlaceholderText: {
    color: colors.textSecondary,
  },
  previewChipTextSplit: {
    color: colors.danger,
  },
  previewUnavailableText: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
  rowCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    gap: spacing.xs,
  },
});
