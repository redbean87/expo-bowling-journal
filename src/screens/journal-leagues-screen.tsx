import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card, Input } from '@/components/ui';
import { useLeagues } from '@/hooks/journal';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

export default function JournalLeaguesScreen() {
  const router = useRouter();
  const {
    leagues,
    isLoading: isLeaguesLoading,
    createLeague,
    updateLeague,
    removeLeague,
    isCreating: isCreatingLeague,
  } = useLeagues();
  const [leagueName, setLeagueName] = useState('');
  const [leagueGamesPerSession, setLeagueGamesPerSession] = useState('');
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [leagueActionError, setLeagueActionError] = useState<string | null>(
    null
  );
  const [editingLeagueId, setEditingLeagueId] = useState<string | null>(null);
  const [editingLeagueName, setEditingLeagueName] = useState('');
  const [editingLeagueGamesPerSession, setEditingLeagueGamesPerSession] =
    useState('');
  const [isSavingLeagueEdit, setIsSavingLeagueEdit] = useState(false);
  const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null);
  const defaultLeagueId = leagues[0]?._id ?? null;

  const navigateToLeagueSessions = (leagueId: string) => {
    router.push({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: { leagueId } as never,
    } as never);
  };

  const startLeagueNight = (leagueId: string) => {
    router.push({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: {
        leagueId,
        startTonight: '1',
      } as never,
    } as never);
  };

  const confirmDeleteLeague = async (name: string) => {
    const message = `Delete ${name}, all sessions, and all games?`;

    if (Platform.OS === 'web') {
      return globalThis.confirm(message);
    }

    return await new Promise<boolean>((resolve) => {
      Alert.alert('Delete league?', message, [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ]);
    });
  };

  const onCreateLeague = async () => {
    setLeagueError(null);
    const name = leagueName.trim();

    if (name.length === 0) {
      setLeagueError('League name is required.');
      return;
    }

    let gamesPerSession: number | null | undefined = undefined;
    const targetGamesInput = leagueGamesPerSession.trim();

    if (targetGamesInput.length > 0) {
      const parsed = Number(targetGamesInput);

      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
        setLeagueError(
          'Games per session must be a whole number from 1 to 12.'
        );
        return;
      }

      gamesPerSession = parsed;
    }

    try {
      const leagueId = await createLeague({ name, gamesPerSession });
      setLeagueName('');
      setLeagueGamesPerSession('');
      router.push({
        pathname: '/journal/[leagueId]/sessions' as never,
        params: { leagueId } as never,
      } as never);
    } catch (caught) {
      setLeagueError(
        caught instanceof Error ? caught.message : 'Unable to create league.'
      );
    }
  };

  const startEditingLeague = (
    leagueId: string,
    name: string,
    gamesPerSession: number | null
  ) => {
    setLeagueActionError(null);
    setEditingLeagueId(leagueId);
    setEditingLeagueName(name);
    setEditingLeagueGamesPerSession(
      gamesPerSession === null ? '' : String(gamesPerSession)
    );
  };

  const cancelEditingLeague = () => {
    setEditingLeagueId(null);
    setEditingLeagueName('');
    setEditingLeagueGamesPerSession('');
  };

  const onSaveLeagueEdit = async () => {
    if (!editingLeagueId) {
      return;
    }

    setLeagueActionError(null);
    const name = editingLeagueName.trim();

    if (name.length === 0) {
      setLeagueActionError('League name is required.');
      return;
    }

    let gamesPerSession: number | null | undefined = undefined;
    const targetGamesInput = editingLeagueGamesPerSession.trim();

    if (targetGamesInput.length > 0) {
      const parsed = Number(targetGamesInput);

      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
        setLeagueActionError(
          'Games per session must be a whole number from 1 to 12.'
        );
        return;
      }

      gamesPerSession = parsed;
    }

    setIsSavingLeagueEdit(true);

    try {
      await updateLeague({
        leagueId: editingLeagueId as never,
        name,
        gamesPerSession,
      });
      cancelEditingLeague();
    } catch (caught) {
      setLeagueActionError(
        caught instanceof Error ? caught.message : 'Unable to update league.'
      );
    } finally {
      setIsSavingLeagueEdit(false);
    }
  };

  const onDeleteLeague = async (leagueId: string, name: string) => {
    setLeagueActionError(null);
    const isConfirmed = await confirmDeleteLeague(name);

    if (!isConfirmed) {
      return;
    }

    setDeletingLeagueId(leagueId);

    try {
      await removeLeague({ leagueId: leagueId as never });

      if (editingLeagueId === leagueId) {
        cancelEditingLeague();
      }
    } catch (caught) {
      setLeagueActionError(
        caught instanceof Error ? caught.message : 'Unable to delete league.'
      );
    } finally {
      setDeletingLeagueId(null);
    }
  };

  return (
    <ScreenLayout
      title="Journal"
      subtitle="Start with a league, then drill into sessions and games."
      fillCard
      hideHeader
      compact
      chromeless
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <View style={styles.createSection}>
          <Input
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setLeagueName}
            placeholder="League name"
            value={leagueName}
          />
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            onChangeText={setLeagueGamesPerSession}
            placeholder="Games per session (optional)"
            value={leagueGamesPerSession}
          />
          {leagueError ? (
            <Text style={styles.errorText}>{leagueError}</Text>
          ) : null}
          <Button
            disabled={isCreatingLeague}
            label={isCreatingLeague ? 'Creating...' : 'Create league'}
            onPress={onCreateLeague}
          />
        </View>

        {leagueActionError ? (
          <Text style={styles.errorText}>{leagueActionError}</Text>
        ) : null}

        {isLeaguesLoading ? (
          <Text style={styles.meta}>Loading leagues...</Text>
        ) : null}
        {!isLeaguesLoading && leagues.length === 0 ? (
          <Text style={styles.meta}>
            No leagues yet. Create your first league to get started.
          </Text>
        ) : null}

        <Button
          disabled={!defaultLeagueId || isLeaguesLoading}
          label="Continue tonight"
          variant="secondary"
          onPress={() => {
            if (!defaultLeagueId) {
              return;
            }

            startLeagueNight(defaultLeagueId);
          }}
        />

        {leagues.map((league) => (
          <Card key={league._id} style={styles.rowCard}>
            <Pressable
              onPress={() => navigateToLeagueSessions(league._id)}
              style={({ pressed }) => [
                styles.leagueContent,
                pressed ? styles.leagueContentPressed : null,
              ]}
            >
              <Text style={styles.rowTitle}>{league.name}</Text>
              <Text style={styles.meta}>
                {league.houseName ?? 'No house set'}
              </Text>
              <Text style={styles.meta}>
                Target games: {league.gamesPerSession ?? 'Not set'}
              </Text>
            </Pressable>

            <View style={styles.rowActions}>
              <Pressable
                onPress={() => startLeagueNight(league._id)}
                style={({ pressed }) => [
                  styles.quickStartLink,
                  pressed ? styles.quickStartLinkPressed : null,
                ]}
              >
                <Text style={styles.quickStartLabel}>Quick start</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  startEditingLeague(
                    league._id,
                    league.name,
                    league.gamesPerSession ?? null
                  )
                }
                style={({ pressed }) => [
                  styles.quickStartLink,
                  pressed ? styles.quickStartLinkPressed : null,
                ]}
              >
                <Text style={styles.quickStartLabel}>Edit</Text>
              </Pressable>
              <Pressable
                disabled={deletingLeagueId === league._id}
                onPress={() => void onDeleteLeague(league._id, league.name)}
                style={({ pressed }) => [
                  styles.quickStartLink,
                  pressed ? styles.quickStartLinkPressed : null,
                ]}
              >
                <Text style={styles.deleteLabel}>
                  {deletingLeagueId === league._id ? 'Deleting...' : 'Delete'}
                </Text>
              </Pressable>
            </View>

            {editingLeagueId === league._id ? (
              <View style={styles.editSection}>
                <Input
                  autoCapitalize="words"
                  autoCorrect={false}
                  onChangeText={setEditingLeagueName}
                  placeholder="League name"
                  value={editingLeagueName}
                />
                <Input
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  onChangeText={setEditingLeagueGamesPerSession}
                  placeholder="Games per session (optional)"
                  value={editingLeagueGamesPerSession}
                />
                <View style={styles.editActionsRow}>
                  <View style={styles.editActionButton}>
                    <Button
                      disabled={isSavingLeagueEdit}
                      label={isSavingLeagueEdit ? 'Saving...' : 'Save'}
                      onPress={() => void onSaveLeagueEdit()}
                      variant="secondary"
                    />
                  </View>
                  <View style={styles.editActionButton}>
                    <Button
                      disabled={isSavingLeagueEdit}
                      label="Cancel"
                      onPress={cancelEditingLeague}
                      variant="ghost"
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  errorText: {
    fontSize: typeScale.bodySm,
    color: colors.danger,
  },
  createSection: {
    gap: spacing.sm,
  },
  rowTitle: {
    fontSize: typeScale.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  leagueContent: {
    gap: spacing.xs,
  },
  leagueContentPressed: {
    opacity: 0.82,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    marginTop: 2,
  },
  quickStartLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
  },
  quickStartLinkPressed: {
    opacity: 0.75,
  },
  quickStartLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: 'rgba(27, 110, 243, 0.9)',
  },
  deleteLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.danger,
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
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    gap: spacing.xs,
  },
});
