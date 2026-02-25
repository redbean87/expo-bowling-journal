import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReferenceOption } from '@/hooks/journal/use-reference-data';

import { ReferenceCombobox } from '@/components/reference-combobox';
import { Button, Card, Input } from '@/components/ui';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

type DisplayLeague = {
  id: string;
  leagueId: string | null;
  name: string;
  houseName: string | null;
  houseId: string | null;
  gamesPerSession: number | null;
  isDraft: boolean;
};

type LeagueRowCardProps = {
  league: DisplayLeague;
  isEditing: boolean;
  isDeleting: boolean;
  isSavingLeagueEdit: boolean;
  editingLeagueName: string;
  editingLeagueGamesPerSession: string;
  editingLeagueHouseId: string | null;
  houseOptions: ReferenceOption<string>[];
  recentHouseOptions: ReferenceOption<string>[];
  buildSuggestions: (
    allOptions: ReferenceOption<string>[],
    recentOptions: ReferenceOption<string>[],
    query: string
  ) => ReferenceOption<string>[];
  createHouse: (name: string) => Promise<ReferenceOption<string>>;
  onNavigate: () => void;
  onOpenActions: () => void;
  onEditingLeagueNameChange: (value: string) => void;
  onEditingLeagueGamesPerSessionChange: (value: string) => void;
  onEditingLeagueHouseSelect: (option: ReferenceOption<string>) => void;
  onSaveLeagueEdit: () => void;
  onCancelEditingLeague: () => void;
};

export function LeagueRowCard({
  league,
  isEditing,
  isDeleting,
  isSavingLeagueEdit,
  editingLeagueName,
  editingLeagueGamesPerSession,
  editingLeagueHouseId,
  houseOptions,
  recentHouseOptions,
  buildSuggestions,
  createHouse,
  onNavigate,
  onOpenActions,
  onEditingLeagueNameChange,
  onEditingLeagueGamesPerSessionChange,
  onEditingLeagueHouseSelect,
  onSaveLeagueEdit,
  onCancelEditingLeague,
}: LeagueRowCardProps) {
  return (
    <Card style={[styles.rowCard, isEditing ? styles.rowCardActive : null]}>
      <View style={styles.rowHeader}>
        <Pressable
          onPress={onNavigate}
          style={({ pressed }) => [
            styles.leagueContent,
            pressed ? styles.leagueContentPressed : null,
          ]}
        >
          <Text style={styles.rowTitle}>{league.name}</Text>
          <Text style={styles.meta}>{league.houseName ?? 'No house set'}</Text>
          <Text style={styles.meta}>
            Target games: {league.gamesPerSession ?? 'Not set'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityLabel={`League actions for ${league.name}`}
          disabled={league.isDraft || isDeleting}
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

      {league.leagueId && isEditing ? (
        <View style={styles.editSection}>
          <Input
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={onEditingLeagueNameChange}
            placeholder="League name"
            value={editingLeagueName}
          />
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            onChangeText={onEditingLeagueGamesPerSessionChange}
            placeholder="Games per session (optional)"
            value={editingLeagueGamesPerSession}
          />
          <ReferenceCombobox
            allOptions={houseOptions}
            createLabel="Add house"
            getSuggestions={buildSuggestions}
            onQuickAdd={createHouse}
            onSelect={onEditingLeagueHouseSelect}
            placeholder="House (optional)"
            recentOptions={recentHouseOptions}
            valueId={editingLeagueHouseId}
          />
          <View style={styles.editActionsRow}>
            <View style={styles.editActionButton}>
              <Button
                disabled={isSavingLeagueEdit}
                label={isSavingLeagueEdit ? 'Saving...' : 'Save'}
                onPress={onSaveLeagueEdit}
                variant="secondary"
              />
            </View>
            <View style={styles.editActionButton}>
              <Button
                disabled={isSavingLeagueEdit}
                label="Cancel"
                onPress={onCancelEditingLeague}
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
  leagueContent: {
    gap: spacing.xs,
    flex: 1,
  },
  leagueContentPressed: {
    opacity: 0.82,
  },
  rowHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
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
  rowCard: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    gap: spacing.xs,
  },
  rowCardActive: {
    position: 'relative',
    zIndex: 30,
    elevation: 30,
  },
  meta: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
});
