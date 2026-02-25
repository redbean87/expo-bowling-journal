import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { ReferenceCombobox } from '@/components/reference-combobox';
import { Button, Card, Input } from '@/components/ui';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

type DisplaySession = {
  id: string;
  sessionId: string | null;
  date: string;
  houseId: string | null;
  patternId: string | null;
  ballId: string | null;
  isDraft: boolean;
};

type SessionRowCardProps = {
  session: DisplaySession;
  isEditing: boolean;
  isDeleting: boolean;
  isSavingSessionEdit: boolean;
  sessionWeekLabel: string;
  sessionDateLabel: string;
  editingSessionDate: string;
  editingSessionWeekNumber: string;
  editingSessionHouseId: string | null;
  editingSessionPatternId: string | null;
  editingSessionBallId: string | null;
  houseOptions: ReferenceOption<string>[];
  recentHouseOptions: ReferenceOption<string>[];
  patternOptions: ReferenceOption<string>[];
  recentPatternOptions: ReferenceOption<string>[];
  ballOptions: ReferenceOption<string>[];
  recentBallOptions: ReferenceOption<string>[];
  buildSuggestions: (
    allOptions: ReferenceOption<string>[],
    recentOptions: ReferenceOption<string>[],
    query: string
  ) => ReferenceOption<string>[];
  createHouse: (name: string) => Promise<ReferenceOption<string>>;
  createPattern: (name: string) => Promise<ReferenceOption<string>>;
  createBall: (name: string) => Promise<ReferenceOption<string>>;
  onNavigate: () => void;
  onOpenActions: () => void;
  onEditingSessionDateChange: (value: string) => void;
  onEditingSessionWeekNumberChange: (value: string) => void;
  onEditingSessionHouseSelect: (option: ReferenceOption<string>) => void;
  onEditingSessionPatternSelect: (option: ReferenceOption<string>) => void;
  onEditingSessionBallSelect: (option: ReferenceOption<string>) => void;
  onSaveSessionEdit: () => void;
  onCancelEditingSession: () => void;
};

export function SessionRowCard({
  session,
  isEditing,
  isDeleting,
  isSavingSessionEdit,
  sessionWeekLabel,
  sessionDateLabel,
  editingSessionDate,
  editingSessionWeekNumber,
  editingSessionHouseId,
  editingSessionPatternId,
  editingSessionBallId,
  houseOptions,
  recentHouseOptions,
  patternOptions,
  recentPatternOptions,
  ballOptions,
  recentBallOptions,
  buildSuggestions,
  createHouse,
  createPattern,
  createBall,
  onNavigate,
  onOpenActions,
  onEditingSessionDateChange,
  onEditingSessionWeekNumberChange,
  onEditingSessionHouseSelect,
  onEditingSessionPatternSelect,
  onEditingSessionBallSelect,
  onSaveSessionEdit,
  onCancelEditingSession,
}: SessionRowCardProps) {
  return (
    <Card style={[styles.rowCard, isEditing ? styles.rowCardActive : null]}>
      <View style={styles.rowHeader}>
        <Pressable
          style={({ pressed }) => [
            styles.sessionContent,
            pressed ? styles.rowPressed : null,
          ]}
          onPress={onNavigate}
        >
          <Text style={styles.rowTitle}>{sessionWeekLabel}</Text>
          <Text style={styles.meta}>{sessionDateLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Session actions for ${sessionDateLabel}`}
          disabled={session.isDraft || isDeleting}
          hitSlop={8}
          onPress={onOpenActions}
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

      {session.sessionId && isEditing ? (
        <View style={styles.editSection}>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onEditingSessionDateChange}
            placeholder="YYYY-MM-DD"
            value={editingSessionDate}
          />
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            onChangeText={onEditingSessionWeekNumberChange}
            placeholder="Week number (optional)"
            value={editingSessionWeekNumber}
          />
          <ReferenceCombobox
            allOptions={houseOptions}
            createLabel="Add house"
            getSuggestions={buildSuggestions}
            onQuickAdd={createHouse}
            onSelect={onEditingSessionHouseSelect}
            placeholder="House (optional)"
            recentOptions={recentHouseOptions}
            valueId={editingSessionHouseId}
          />
          <ReferenceCombobox
            allOptions={patternOptions}
            createLabel="Add pattern"
            getSuggestions={buildSuggestions}
            onQuickAdd={createPattern}
            onSelect={onEditingSessionPatternSelect}
            placeholder="Pattern (optional)"
            recentOptions={recentPatternOptions}
            valueId={editingSessionPatternId}
          />
          <ReferenceCombobox
            allOptions={ballOptions}
            createLabel="Add ball"
            getSuggestions={buildSuggestions}
            onQuickAdd={createBall}
            onSelect={onEditingSessionBallSelect}
            placeholder="Ball (optional)"
            recentOptions={recentBallOptions}
            valueId={editingSessionBallId}
          />
          <View style={styles.editActionsRow}>
            <View style={styles.editActionButton}>
              <Button
                disabled={isSavingSessionEdit}
                label={isSavingSessionEdit ? 'Saving...' : 'Save'}
                onPress={onSaveSessionEdit}
                variant="secondary"
              />
            </View>
            <View style={styles.editActionButton}>
              <Button
                disabled={isSavingSessionEdit}
                label="Cancel"
                onPress={onCancelEditingSession}
                variant="ghost"
              />
            </View>
          </View>
        </View>
      ) : null}
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
  sessionContent: {
    flex: 1,
  },
  menuButton: {
    width: 40,
    height: 44,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  menuButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  editSection: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  editActionButton: {
    flex: 1,
  },
  meta: {
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
  rowCardActive: {
    position: 'relative',
    zIndex: 30,
    elevation: 30,
  },
});
