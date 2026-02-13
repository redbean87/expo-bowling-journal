import { useConvexAuth, useQuery } from 'convex/react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Button, Card } from '@/components/ui';
import { env } from '@/config/env';
import { viewerQuery } from '@/convex/functions';
import { useImportBackup } from '@/hooks/journal';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

function formatDate(value: number | null) {
  if (!value) {
    return 'Not completed yet';
  }

  return new Date(value).toLocaleString();
}

export default function ProfileScreen() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(viewerQuery);
  const {
    pickBackupFile,
    startBackupImport,
    selectedFileLabel,
    importStatus,
    isUploading,
    error,
  } = useImportBackup();

  const status = importStatus?.status ?? null;
  const isImporting =
    status === 'queued' || status === 'parsing' || status === 'importing';

  return (
    <ScreenLayout
      title="Profile"
      subtitle="Import your SQLite backup and track import progress here."
    >
      <View style={styles.content}>
        <Text style={styles.copy}>
          Choose your backup file, upload it, and this screen will update with
          the import status and summary counts.
        </Text>

        {!isAuthenticated ? (
          <Text style={styles.meta}>
            Sign in from Home before importing a backup.
          </Text>
        ) : null}

        {!env.importWorkerUrl ? (
          <Text style={styles.errorText}>
            Missing EXPO_PUBLIC_IMPORT_WORKER_URL. Add it to enable backup
            uploads.
          </Text>
        ) : null}

        <Card muted>
          <Text style={styles.sectionTitle}>Backup file</Text>
          <Text style={styles.meta}>
            {selectedFileLabel ?? 'No file selected'}
          </Text>

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

          {isUploading ? <ActivityIndicator color={colors.accent} /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </Card>

        {importStatus ? (
          <Card muted>
            <Text style={styles.sectionTitle}>Import status</Text>
            <Text style={styles.meta}>Status: {importStatus.status}</Text>
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
              <Text style={styles.errorText}>{importStatus.errorMessage}</Text>
            ) : null}

            {isImporting ? (
              <View style={styles.inlineRow}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.meta}>Import in progress...</Text>
              </View>
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
          </Card>
        ) : null}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  copy: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: typeScale.titleSm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: typeScale.bodySm,
    color: colors.danger,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countsGrid: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
});
