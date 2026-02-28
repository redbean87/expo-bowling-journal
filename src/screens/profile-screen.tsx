import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card } from '@/components/ui';
import { env } from '@/config/env';
import { viewerQuery } from '@/convex/functions';
import { useExportSqliteBackup, useImportBackup } from '@/hooks/journal';
import { usePreferences } from '@/providers/preferences-provider';
import { ProfilePreferencesCard } from '@/screens/profile/profile-preferences-card';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

function formatDate(value: number | null) {
  if (!value) {
    return 'Not completed yet';
  }

  return new Date(value).toLocaleString();
}

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const viewer = useQuery(viewerQuery);
  const {
    pickBackupFile,
    startBackupImport,
    selectedFileLabel,
    importStatus,
    isUploading,
    error,
  } = useImportBackup();
  const { exportSqliteBackup, isExporting, exportError, lastExportFileName } =
    useExportSqliteBackup();

  const status = importStatus?.status ?? null;
  const isImporting =
    status === 'queued' || status === 'parsing' || status === 'importing';
  const [showImportDetails, setShowImportDetails] = useState(false);
  const {
    scoreboardLayout,
    setScoreboardLayout,
    colorModePreference,
    setColorModePreference,
    isHydrated,
  } = usePreferences();

  return (
    <ScreenLayout
      title="Profile"
      subtitle=""
      hideHeader
      fillCard
      compact
      chromeless
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Backup & restore</Text>
          <Text style={styles.meta}>
            Select a backup file and start import when you are ready.
          </Text>
          <Text style={styles.meta}>
            {selectedFileLabel ?? 'No file selected'}
          </Text>

          <Button
            disabled={isExporting || !isAuthenticated || !env.importWorkerUrl}
            label={
              isExporting ? 'Exporting backup...' : 'Export SQLite backup (.db)'
            }
            onPress={() => void exportSqliteBackup(env.importWorkerUrl)}
            variant="secondary"
          />

          <Button
            label="Choose backup file"
            onPress={() => void pickBackupFile()}
            variant="secondary"
          />

          <Button
            disabled={
              isUploading ||
              !isAuthenticated ||
              !env.importWorkerUrl ||
              !selectedFileLabel
            }
            label={
              isUploading ? 'Uploading backup...' : 'Upload and start import'
            }
            onPress={() =>
              void startBackupImport(
                env.importWorkerUrl,
                viewer?.userId ?? null
              )
            }
          />

          {!isAuthenticated ? (
            <Text style={styles.meta}>Sign in from Home before importing.</Text>
          ) : null}
          {!env.importWorkerUrl ? (
            <Text style={styles.errorText}>
              Missing EXPO_PUBLIC_IMPORT_WORKER_URL. Add it to enable uploads.
            </Text>
          ) : null}
          {isUploading ? <ActivityIndicator color={colors.accent} /> : null}
          {isExporting ? <ActivityIndicator color={colors.accent} /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {exportError ? (
            <Text style={styles.errorText}>{exportError}</Text>
          ) : null}
          {lastExportFileName ? (
            <Text style={styles.meta}>Downloaded: {lastExportFileName}</Text>
          ) : null}
        </Card>

        {importStatus ? (
          <Card muted style={styles.sectionCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Import progress</Text>
              <Text style={styles.statusBadge}>{importStatus.status}</Text>
            </View>

            <Text style={styles.meta}>
              {importStatus.completedAt
                ? `Completed: ${formatDate(importStatus.completedAt)}`
                : `Started: ${formatDate(importStatus.importedAt)}`}
            </Text>

            {isImporting ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.meta}>Import in progress...</Text>
              </View>
            ) : null}

            <Pressable
              onPress={() => setShowImportDetails((current) => !current)}
              style={({ pressed }) => [
                styles.inlineAction,
                pressed ? styles.inlineActionPressed : null,
              ]}
            >
              <Text style={styles.inlineActionLabel}>
                {showImportDetails ? 'Hide details' : 'Show details'}
              </Text>
            </Pressable>

            {showImportDetails ? (
              <View style={styles.detailsBlock}>
                <Text style={styles.meta}>
                  Started: {formatDate(importStatus.importedAt)}
                </Text>
                <Text style={styles.meta}>
                  Completed: {formatDate(importStatus.completedAt)}
                </Text>
                {importStatus.sourceFileName ? (
                  <Text style={styles.meta}>
                    File: {importStatus.sourceFileName}
                  </Text>
                ) : null}
                {importStatus.errorMessage ? (
                  <Text style={styles.errorText}>
                    {importStatus.errorMessage}
                  </Text>
                ) : null}

                <View style={styles.countsGrid}>
                  <Text style={styles.meta}>
                    Houses: {importStatus.counts.houses}
                  </Text>
                  <Text style={styles.meta}>
                    Patterns: {importStatus.counts.patterns}
                  </Text>
                  <Text style={styles.meta}>
                    Balls: {importStatus.counts.balls}
                  </Text>
                  <Text style={styles.meta}>
                    Leagues: {importStatus.counts.leagues}
                  </Text>
                  <Text style={styles.meta}>
                    Weeks: {importStatus.counts.weeks}
                  </Text>
                  <Text style={styles.meta}>
                    Sessions: {importStatus.counts.sessions}
                  </Text>
                  <Text style={styles.meta}>
                    Games: {importStatus.counts.games}
                  </Text>
                  <Text style={styles.meta}>
                    Frames: {importStatus.counts.frames}
                  </Text>
                  <Text style={styles.meta}>
                    Refined games: {importStatus.counts.gamesRefined}
                  </Text>
                  <Text style={styles.meta}>
                    Patched games: {importStatus.counts.gamesPatched}
                  </Text>
                  <Text style={styles.meta}>
                    Warnings: {importStatus.counts.warnings}
                  </Text>
                </View>
              </View>
            ) : null}
          </Card>
        ) : null}

        <ProfilePreferencesCard
          colorModePreference={colorModePreference}
          isHydrated={isHydrated}
          scoreboardLayout={scoreboardLayout}
          setColorModePreference={setColorModePreference}
          setScoreboardLayout={setScoreboardLayout}
        />

        <Card muted style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.meta}>
            {viewer?.email ? `Signed in as ${viewer.email}` : 'Signed in'}
          </Text>
          <Pressable
            onPress={() => void signOut()}
            style={({ pressed }) => [
              styles.inlineAction,
              pressed ? styles.inlineActionPressed : null,
            ]}
          >
            <Text style={styles.inlineActionLabel}>Sign out</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </ScreenLayout>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
    },
    sectionCard: {
      gap: spacing.sm,
    },
    sectionTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    statusBadge: {
      fontSize: typeScale.bodySm,
      fontWeight: '600',
      color: colors.accent,
    },
    meta: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
    errorText: {
      fontSize: typeScale.bodySm,
      color: colors.danger,
      lineHeight: lineHeight.compact,
    },
    inlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    inlineAction: {
      paddingVertical: spacing.xs,
      alignSelf: 'flex-start',
    },
    inlineActionPressed: {
      opacity: 0.72,
    },
    inlineActionLabel: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.accent,
    },
    detailsBlock: {
      gap: spacing.xs,
    },
    countsGrid: {
      gap: spacing.xs,
      paddingTop: spacing.xs,
    },
  });
