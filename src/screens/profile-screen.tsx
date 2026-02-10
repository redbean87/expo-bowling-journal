import { useConvexAuth, useQuery } from 'convex/react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { viewerQuery } from '@/convex/functions';
import { useImportBackup } from '@/hooks/journal';
import { env } from '@/config/env';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { colors } from '@/theme/tokens';

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
    <PlaceholderScreen
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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Backup file</Text>
          <Text style={styles.meta}>
            {selectedFileLabel ?? 'No file selected'}
          </Text>

          <Pressable
            onPress={() => void pickBackupFile()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonLabel}>Choose backup file</Text>
          </Pressable>

          <Pressable
            disabled={
              isUploading ||
              !isAuthenticated ||
              !env.importWorkerUrl ||
              !selectedFileLabel
            }
            onPress={() =>
              void startBackupImport(
                env.importWorkerUrl,
                viewer?.userId ?? null
              )
            }
            style={[
              styles.actionButton,
              isUploading || !selectedFileLabel
                ? styles.actionButtonDisabled
                : null,
            ]}
          >
            <Text style={styles.actionButtonLabel}>
              {isUploading ? 'Uploading backup...' : 'Upload and start import'}
            </Text>
          </Pressable>

          {isUploading ? <ActivityIndicator color={colors.accent} /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {importStatus ? (
          <View style={styles.card}>
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
          </View>
        ) : null}
      </View>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  copy: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  card: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#F8FAFF',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 13,
    color: '#B42318',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countsGrid: {
    gap: 4,
    paddingTop: 4,
  },
  actionButton: {
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryButton: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
});
