import { useRouter } from 'expo-router';
import { useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { getCreateModalTranslateY } from './journal/modal-layout-utils';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { ReferenceCombobox } from '@/components/reference-combobox';
import { SyncStatusChip } from '@/components/sync-status-chip';
import { Button, Card, FloatingActionButton, Input } from '@/components/ui';
import {
  useLeagues,
  useQueueSyncStatus,
  useReferenceData,
} from '@/hooks/journal';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

function formatRelativeTime(timestamp: number | null, now: number) {
  if (!timestamp) {
    return null;
  }

  const deltaMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(deltaMs / 60000);

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${String(minutes)}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${String(hours)}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${String(days)}d ago`;
}

function formatRetryTime(timestamp: number | null, now: number) {
  if (!timestamp) {
    return null;
  }

  const deltaMs = Math.max(0, timestamp - now);
  const seconds = Math.ceil(deltaMs / 1000);

  if (seconds <= 0) {
    return 'any moment';
  }

  if (seconds < 60) {
    return `in ${String(seconds)}s`;
  }

  const minutes = Math.ceil(seconds / 60);

  if (minutes < 60) {
    return `in ${String(minutes)}m`;
  }

  const hours = Math.ceil(minutes / 60);
  return `in ${String(hours)}h`;
}

type LeagueActionTarget = {
  leagueId: string;
  name: string;
  gamesPerSession: number | null;
  houseId: string | null;
};

export default function JournalLeaguesScreen() {
  const { width: windowWidth } = useWindowDimensions();
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
  const [leagueHouseId, setLeagueHouseId] = useState<string | null>(null);
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [leagueActionError, setLeagueActionError] = useState<string | null>(
    null
  );
  const [editingLeagueId, setEditingLeagueId] = useState<string | null>(null);
  const [editingLeagueName, setEditingLeagueName] = useState('');
  const [editingLeagueGamesPerSession, setEditingLeagueGamesPerSession] =
    useState('');
  const [editingLeagueHouseId, setEditingLeagueHouseId] = useState<
    string | null
  >(null);
  const [isSavingLeagueEdit, setIsSavingLeagueEdit] = useState(false);
  const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null);
  const [isLeagueActionsVisible, setIsLeagueActionsVisible] = useState(false);
  const [leagueActionTarget, setLeagueActionTarget] =
    useState<LeagueActionTarget | null>(null);
  const [isSyncStatusVisible, setIsSyncStatusVisible] = useState(false);
  const modalTranslateY = getCreateModalTranslateY(windowWidth);
  const { houseOptions, recentHouseOptions, buildSuggestions, createHouse } =
    useReferenceData();
  const {
    status: queueStatus,
    refreshStatus,
    retryNow,
    isRetryingNow,
  } = useQueueSyncStatus();
  const now = Date.now();

  const syncChipLabel =
    queueStatus.state === 'syncing'
      ? 'Syncing...'
      : queueStatus.state === 'attention'
        ? 'Needs attention'
        : queueStatus.state === 'retrying'
          ? 'Retrying soon'
          : `${String(queueStatus.queuedCount)} queued`;

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
      const leagueId = await createLeague({
        name,
        gamesPerSession,
        houseId: leagueHouseId as never,
      });
      setLeagueName('');
      setLeagueGamesPerSession('');
      setLeagueHouseId(null);
      setLeagueError(null);
      setIsCreateModalVisible(false);
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
    gamesPerSession: number | null,
    houseId: string | null
  ) => {
    setLeagueActionError(null);
    setEditingLeagueId(leagueId);
    setEditingLeagueName(name);
    setEditingLeagueGamesPerSession(
      gamesPerSession === null ? '' : String(gamesPerSession)
    );
    setEditingLeagueHouseId(houseId);
  };

  const cancelEditingLeague = () => {
    setEditingLeagueId(null);
    setEditingLeagueName('');
    setEditingLeagueGamesPerSession('');
    setEditingLeagueHouseId(null);
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
        houseId: editingLeagueHouseId as never,
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

  const closeLeagueActions = () => {
    setIsLeagueActionsVisible(false);
    setLeagueActionTarget(null);
  };

  const runLeagueAction = (
    action: 'quick-start' | 'edit' | 'delete',
    target: LeagueActionTarget
  ) => {
    if (action === 'quick-start') {
      startLeagueNight(target.leagueId);
      return;
    }

    if (action === 'edit') {
      startEditingLeague(
        target.leagueId,
        target.name,
        target.gamesPerSession,
        target.houseId
      );
      return;
    }

    void onDeleteLeague(target.leagueId, target.name);
  };

  const openLeagueActions = (target: LeagueActionTarget) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Quick start', 'Edit league', 'Delete league', 'Cancel'],
          cancelButtonIndex: 3,
          destructiveButtonIndex: 2,
          title: target.name,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            runLeagueAction('quick-start', target);
            return;
          }

          if (buttonIndex === 1) {
            runLeagueAction('edit', target);
            return;
          }

          if (buttonIndex === 2) {
            runLeagueAction('delete', target);
          }
        }
      );

      return;
    }

    if (Platform.OS === 'android') {
      Alert.alert(target.name, undefined, [
        {
          text: 'Quick start',
          onPress: () => runLeagueAction('quick-start', target),
        },
        {
          text: 'Edit league',
          onPress: () => runLeagueAction('edit', target),
        },
        {
          text: 'Delete league',
          style: 'destructive',
          onPress: () => runLeagueAction('delete', target),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);

      return;
    }

    setLeagueActionTarget(target);
    setIsLeagueActionsVisible(true);
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
      <View style={styles.screenBody}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {queueStatus.state !== 'idle' ? (
            <SyncStatusChip
              label={syncChipLabel}
              onPress={() => {
                void refreshStatus();
                setIsSyncStatusVisible(true);
              }}
              state={queueStatus.state}
            />
          ) : null}

          {leagueActionError ? (
            <Text style={styles.errorText}>{leagueActionError}</Text>
          ) : null}

          {isLeaguesLoading ? (
            <Text style={styles.meta}>Loading leagues...</Text>
          ) : null}
          {!isLeaguesLoading && leagues.length === 0 ? (
            <Text style={styles.meta}>
              No leagues yet. Tap + to create your first league.
            </Text>
          ) : null}

          {leagues.map((league) => (
            <Card
              key={league._id}
              style={[
                styles.rowCard,
                editingLeagueId === league._id ? styles.rowCardActive : null,
              ]}
            >
              <View style={styles.rowHeader}>
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

                <Pressable
                  accessibilityLabel={`League actions for ${league.name}`}
                  disabled={deletingLeagueId === league._id}
                  hitSlop={8}
                  onPress={() =>
                    openLeagueActions({
                      leagueId: league._id,
                      name: league.name,
                      gamesPerSession: league.gamesPerSession ?? null,
                      houseId: league.houseId ? String(league.houseId) : null,
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
                  <ReferenceCombobox
                    allOptions={houseOptions}
                    createLabel="Add house"
                    getSuggestions={buildSuggestions}
                    onQuickAdd={createHouse}
                    onSelect={(option) => setEditingLeagueHouseId(option.id)}
                    placeholder="House (optional)"
                    recentOptions={recentHouseOptions}
                    valueId={editingLeagueHouseId}
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

        <FloatingActionButton
          accessibilityLabel="Create league"
          onPress={() => {
            setLeagueError(null);
            setIsCreateModalVisible(true);
          }}
        />

        <Modal
          animationType="slide"
          transparent
          visible={isCreateModalVisible}
          onRequestClose={() => setIsCreateModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={styles.modalBackdropHitbox}
              onPress={() => setIsCreateModalVisible(false)}
            />
            <View
              style={[
                styles.modalCard,
                { transform: [{ translateY: modalTranslateY }] },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create league</Text>
                <Pressable
                  accessibilityLabel="Close create league dialog"
                  accessibilityRole="button"
                  onPress={() => setIsCreateModalVisible(false)}
                  style={({ pressed }) => [
                    styles.modalCloseButton,
                    pressed ? styles.modalCloseButtonPressed : null,
                  ]}
                >
                  <Text style={styles.modalCloseLabel}>X</Text>
                </Pressable>
              </View>
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
              <ReferenceCombobox
                allOptions={houseOptions}
                createLabel="Add house"
                getSuggestions={buildSuggestions}
                onQuickAdd={createHouse}
                onSelect={(option) => setLeagueHouseId(option.id)}
                placeholder="House (optional)"
                recentOptions={recentHouseOptions}
                valueId={leagueHouseId}
              />
              {leagueError ? (
                <Text style={styles.errorText}>{leagueError}</Text>
              ) : null}
              <View style={styles.modalActions}>
                <View style={styles.modalActionButton}>
                  <Button
                    disabled={isCreatingLeague}
                    label={isCreatingLeague ? 'Creating...' : 'Create'}
                    onPress={onCreateLeague}
                    variant="secondary"
                  />
                </View>
                <View style={styles.modalActionButton}>
                  <Button
                    disabled={isCreatingLeague}
                    label="Cancel"
                    onPress={() => setIsCreateModalVisible(false)}
                    variant="ghost"
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          animationType="fade"
          transparent
          visible={isLeagueActionsVisible}
          onRequestClose={closeLeagueActions}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={styles.modalBackdropHitbox}
              onPress={closeLeagueActions}
            />
            <View
              style={[
                styles.modalCard,
                styles.actionModalCard,
                { transform: [{ translateY: modalTranslateY }] },
              ]}
            >
              <View style={styles.actionModalHeader}>
                <Text numberOfLines={1} style={styles.actionModalTitle}>
                  {leagueActionTarget?.name ?? 'League'}
                </Text>
              </View>
              <View style={styles.actionList}>
                <Pressable
                  onPress={() => {
                    if (!leagueActionTarget) {
                      return;
                    }

                    closeLeagueActions();
                    runLeagueAction('quick-start', leagueActionTarget);
                  }}
                  style={({ pressed }) => [
                    styles.actionItem,
                    styles.actionItemWithDivider,
                    pressed ? styles.actionItemPressed : null,
                  ]}
                >
                  <Text style={styles.actionItemLabel}>Quick start</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!leagueActionTarget) {
                      return;
                    }

                    closeLeagueActions();
                    runLeagueAction('edit', leagueActionTarget);
                  }}
                  style={({ pressed }) => [
                    styles.actionItem,
                    styles.actionItemWithDivider,
                    pressed ? styles.actionItemPressed : null,
                  ]}
                >
                  <Text style={styles.actionItemLabel}>Edit league</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!leagueActionTarget) {
                      return;
                    }

                    closeLeagueActions();
                    runLeagueAction('delete', leagueActionTarget);
                  }}
                  style={({ pressed }) => [
                    styles.actionItem,
                    styles.actionItemWithDivider,
                    pressed ? styles.actionItemPressed : null,
                  ]}
                >
                  <Text style={styles.actionItemDeleteLabel}>
                    Delete league
                  </Text>
                </Pressable>
                <Pressable
                  onPress={closeLeagueActions}
                  style={({ pressed }) => [
                    styles.actionItem,
                    styles.actionItemCancel,
                    pressed ? styles.actionItemPressed : null,
                  ]}
                >
                  <Text style={styles.actionItemCancelLabel}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          animationType="fade"
          transparent
          visible={isSyncStatusVisible}
          onRequestClose={() => setIsSyncStatusVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={styles.modalBackdropHitbox}
              onPress={() => setIsSyncStatusVisible(false)}
            />
            <View
              style={[
                styles.modalCard,
                { transform: [{ translateY: modalTranslateY }] },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Sync status</Text>
                <Pressable
                  accessibilityLabel="Close sync status dialog"
                  accessibilityRole="button"
                  onPress={() => setIsSyncStatusVisible(false)}
                  style={({ pressed }) => [
                    styles.modalCloseButton,
                    pressed ? styles.modalCloseButtonPressed : null,
                  ]}
                >
                  <Text style={styles.modalCloseLabel}>X</Text>
                </Pressable>
              </View>
              <Text style={styles.meta}>
                Queued saves: {queueStatus.queuedCount}
              </Text>
              {queueStatus.oldestPendingAt ? (
                <Text style={styles.meta}>
                  Oldest pending:{' '}
                  {formatRelativeTime(queueStatus.oldestPendingAt, now)}
                </Text>
              ) : null}
              {queueStatus.nextRetryAt ? (
                <Text style={styles.meta}>
                  Next retry: {formatRetryTime(queueStatus.nextRetryAt, now)}
                </Text>
              ) : null}
              {queueStatus.latestActionableError ? (
                <Text style={styles.errorText}>
                  {queueStatus.latestActionableError}
                </Text>
              ) : null}
              <View style={styles.modalActions}>
                <View style={styles.modalActionButton}>
                  <Button
                    disabled={
                      isRetryingNow ||
                      queueStatus.queuedCount === 0 ||
                      queueStatus.state === 'syncing'
                    }
                    label={isRetryingNow ? 'Retrying...' : 'Retry now'}
                    onPress={() => {
                      void retryNow();
                    }}
                    variant="secondary"
                  />
                </View>
                <View style={styles.modalActionButton}>
                  <Button
                    label="Close"
                    onPress={() => setIsSyncStatusVisible(false)}
                    variant="ghost"
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl + 72,
  },
  screenBody: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  errorText: {
    fontSize: typeScale.bodySm,
    color: colors.danger,
  },
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
  rowCardActive: {
    position: 'relative',
    zIndex: 30,
    elevation: 30,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(26, 31, 43, 0.35)',
  },
  modalBackdropHitbox: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: typeScale.titleSm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCloseButtonPressed: {
    opacity: 0.8,
  },
  modalCloseLabel: {
    fontSize: typeScale.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  modalActionButton: {
    flex: 1,
  },
  actionModalCard: {
    gap: spacing.xs,
    padding: spacing.md,
  },
  actionModalHeader: {
    paddingTop: 2,
  },
  actionModalTitle: {
    fontSize: typeScale.titleSm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionList: {
    marginTop: spacing.xs,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSubtle,
  },
  actionItem: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  actionItemWithDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  actionItemCancel: {
    backgroundColor: colors.surface,
  },
  actionItemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  actionItemLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  actionItemDeleteLabel: {
    fontSize: typeScale.body,
    fontWeight: '600',
    color: colors.danger,
  },
  actionItemCancelLabel: {
    fontSize: typeScale.body,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
