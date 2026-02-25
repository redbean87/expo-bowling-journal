import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import {
  createQueuedLeagueCreateEntry,
  isRetryableCreateError,
  upsertQueuedJournalCreateEntry,
  type QueuedLeagueCreateEntry,
} from './journal/journal-create-queue';
import {
  loadJournalCreateQueue,
  persistJournalCreateQueue,
} from './journal/journal-create-queue-storage';
import { CreateLeagueModal } from './journal/components/create-league-modal';
import { LeagueActionsModal } from './journal/components/league-actions-modal';
import { LeagueRowCard } from './journal/components/league-row-card';
import { getCreateModalTranslateY } from './journal/modal-layout-utils';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { SyncStatusChip } from '@/components/sync-status-chip';
import { Button, FloatingActionButton } from '@/components/ui';
import {
  useLeagues,
  useQueueSyncStatus,
  useReferenceData,
} from '@/hooks/journal';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';
import { createClientSyncId } from '@/utils/client-sync-id';

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

function isNavigatorOffline() {
  return (
    typeof globalThis.navigator !== 'undefined' &&
    globalThis.navigator.onLine === false
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Create request timed out.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

type LeagueActionTarget = {
  leagueId: string;
  name: string;
  gamesPerSession: number | null;
  houseId: string | null;
};

type DisplayLeague = {
  id: string;
  leagueId: string | null;
  clientSyncId: string | null;
  name: string;
  houseName: string | null;
  houseId: string | null;
  gamesPerSession: number | null;
  isDraft: boolean;
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
  const [pendingCreateClientSyncId, setPendingCreateClientSyncId] = useState<
    string | null
  >(null);
  const [isCreatingLeagueRequest, setIsCreatingLeagueRequest] = useState(false);
  const [isSyncStatusVisible, setIsSyncStatusVisible] = useState(false);
  const [queuedLeagueCreates, setQueuedLeagueCreates] = useState<
    QueuedLeagueCreateEntry[]
  >([]);
  const modalTranslateY = getCreateModalTranslateY(windowWidth);
  const shouldLoadReferenceData =
    isCreateModalVisible || editingLeagueId !== null;
  const { houseOptions, recentHouseOptions, buildSuggestions, createHouse } =
    useReferenceData({ enabled: shouldLoadReferenceData });
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

  const navigateToLeagueSessions = (league: DisplayLeague) => {
    const leagueRouteId = league.leagueId ?? league.id;

    router.push({
      pathname: '/journal/[leagueId]/sessions' as never,
      params: {
        leagueId: leagueRouteId,
        ...(league.clientSyncId
          ? { leagueClientSyncId: league.clientSyncId }
          : {}),
      } as never,
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
    setIsCreatingLeagueRequest(true);
    const clientSyncId =
      pendingCreateClientSyncId ?? createClientSyncId('league');
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

    const queueLeagueCreate = async () => {
      const now = Date.now();
      const queuedEntry = createQueuedLeagueCreateEntry(
        {
          name,
          gamesPerSession,
          houseId: leagueHouseId as never,
        },
        clientSyncId,
        now
      );
      const currentQueue = await loadJournalCreateQueue();
      const nextQueue = upsertQueuedJournalCreateEntry(
        currentQueue,
        queuedEntry
      );
      await persistJournalCreateQueue(nextQueue);
      setQueuedLeagueCreates(
        nextQueue.filter(
          (entry): entry is QueuedLeagueCreateEntry =>
            entry.entityType === 'league-create'
        )
      );
      setLeagueName('');
      setLeagueGamesPerSession('');
      setLeagueHouseId(null);
      setLeagueError(null);
      setPendingCreateClientSyncId(null);
      setIsCreateModalVisible(false);
      navigateToLeagueSessions({
        id: `draft-${clientSyncId}`,
        leagueId: null,
        clientSyncId,
        name,
        houseName:
          houseOptions.find((option) => option.id === leagueHouseId)?.label ??
          null,
        houseId: leagueHouseId,
        gamesPerSession: gamesPerSession ?? null,
        isDraft: true,
      });
    };

    try {
      if (isNavigatorOffline()) {
        await queueLeagueCreate();
        return;
      }

      const leagueId = await withTimeout(
        createLeague({
          name,
          clientSyncId,
          gamesPerSession,
          houseId: leagueHouseId as never,
        }),
        4500
      );
      setLeagueName('');
      setLeagueGamesPerSession('');
      setLeagueHouseId(null);
      setPendingCreateClientSyncId(null);
      setLeagueError(null);
      setIsCreateModalVisible(false);
      router.push({
        pathname: '/journal/[leagueId]/sessions' as never,
        params: { leagueId } as never,
      } as never);
    } catch (caught) {
      if (isRetryableCreateError(caught)) {
        await queueLeagueCreate();
        return;
      }

      setPendingCreateClientSyncId(clientSyncId);
      setLeagueError(
        caught instanceof Error ? caught.message : 'Unable to create league.'
      );
    } finally {
      setIsCreatingLeagueRequest(false);
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

  const refreshQueuedLeagueCreates = useCallback(async () => {
    const queueEntries = await loadJournalCreateQueue();
    setQueuedLeagueCreates(
      queueEntries.filter(
        (entry): entry is QueuedLeagueCreateEntry =>
          entry.entityType === 'league-create'
      )
    );
  }, []);

  useEffect(() => {
    void refreshQueuedLeagueCreates();
  }, [refreshQueuedLeagueCreates]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshQueuedLeagueCreates();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [refreshQueuedLeagueCreates]);

  const displayLeagues = useMemo<DisplayLeague[]>(() => {
    const serverLeagueByClientSyncId = new Map<string, string>();

    const serverLeagues: DisplayLeague[] = leagues.map((league) => {
      const clientSyncId =
        typeof (league as { clientSyncId?: string | null }).clientSyncId ===
        'string'
          ? ((league as { clientSyncId?: string | null }).clientSyncId ?? null)
          : null;

      if (clientSyncId) {
        serverLeagueByClientSyncId.set(clientSyncId, league._id);
      }

      return {
        id: league._id,
        leagueId: league._id,
        clientSyncId,
        name: league.name,
        houseName: league.houseName ?? null,
        houseId: league.houseId ? String(league.houseId) : null,
        gamesPerSession: league.gamesPerSession ?? null,
        isDraft: false,
      };
    });

    const queuedDrafts: DisplayLeague[] = queuedLeagueCreates
      .filter((entry) => !serverLeagueByClientSyncId.has(entry.clientSyncId))
      .map((entry) => ({
        id: `draft-${entry.clientSyncId}`,
        leagueId: null,
        clientSyncId: entry.clientSyncId,
        name: entry.payload.name,
        houseName:
          houseOptions.find((option) => option.id === entry.payload.houseId)
            ?.label ?? null,
        houseId: entry.payload.houseId ? String(entry.payload.houseId) : null,
        gamesPerSession: entry.payload.gamesPerSession ?? null,
        isDraft: true,
      }));

    return [...queuedDrafts, ...serverLeagues];
  }, [houseOptions, leagues, queuedLeagueCreates]);

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

          {displayLeagues.map((league) => (
            <LeagueRowCard
              key={league.id}
              buildSuggestions={buildSuggestions}
              createHouse={createHouse}
              editingLeagueGamesPerSession={editingLeagueGamesPerSession}
              editingLeagueHouseId={editingLeagueHouseId}
              editingLeagueName={editingLeagueName}
              houseOptions={houseOptions}
              isDeleting={deletingLeagueId === league.leagueId}
              isEditing={editingLeagueId === league.leagueId}
              isSavingLeagueEdit={isSavingLeagueEdit}
              league={league}
              onCancelEditingLeague={cancelEditingLeague}
              onEditingLeagueGamesPerSessionChange={
                setEditingLeagueGamesPerSession
              }
              onEditingLeagueHouseSelect={(option) =>
                setEditingLeagueHouseId(option.id)
              }
              onEditingLeagueNameChange={setEditingLeagueName}
              onNavigate={() => navigateToLeagueSessions(league)}
              onOpenActions={() =>
                openLeagueActions({
                  leagueId: league.leagueId ?? '',
                  name: league.name,
                  gamesPerSession: league.gamesPerSession ?? null,
                  houseId: league.houseId,
                })
              }
              onSaveLeagueEdit={() => {
                void onSaveLeagueEdit();
              }}
              recentHouseOptions={recentHouseOptions}
            />
          ))}
        </ScrollView>

        <FloatingActionButton
          accessibilityLabel="Create league"
          onPress={() => {
            setLeagueError(null);
            setIsCreateModalVisible(true);
          }}
        />

        <CreateLeagueModal
          buildSuggestions={buildSuggestions}
          createHouse={createHouse}
          houseOptions={houseOptions}
          isCreatingLeagueRequest={isCreatingLeagueRequest}
          leagueError={leagueError}
          leagueGamesPerSession={leagueGamesPerSession}
          leagueHouseId={leagueHouseId}
          leagueName={leagueName}
          modalTranslateY={modalTranslateY}
          onClose={() => setIsCreateModalVisible(false)}
          onCreate={onCreateLeague}
          onGamesPerSessionChange={setLeagueGamesPerSession}
          onLeagueHouseSelect={(option) => setLeagueHouseId(option.id)}
          onLeagueNameChange={setLeagueName}
          recentHouseOptions={recentHouseOptions}
          visible={isCreateModalVisible}
        />

        <LeagueActionsModal
          modalTranslateY={modalTranslateY}
          onAction={runLeagueAction}
          onClose={closeLeagueActions}
          target={leagueActionTarget}
          visible={isLeagueActionsVisible}
        />

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
  meta: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
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
});
