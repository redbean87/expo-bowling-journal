import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useState } from 'react';
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
import { type ScoreboardLayoutMode } from '@/config/preferences-storage';
import { viewerQuery } from '@/convex/functions';
import { useImportBackup } from '@/hooks/journal';
import { usePreferences } from '@/providers/preferences-provider';
import { colors, lineHeight, spacing, typeScale } from '@/theme/tokens';

function formatDate(value: number | null) {
  if (!value) {
    return 'Not completed yet';
  }

  return new Date(value).toLocaleString();
}

export default function ProfileScreen() {
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

  const status = importStatus?.status ?? null;
  const isImporting =
    status === 'queued' || status === 'parsing' || status === 'importing';
  const [showImportDetails, setShowImportDetails] = useState(false);
  const { scoreboardLayout, setScoreboardLayout, isHydrated } =
    usePreferences();

  const scoreboardLayoutOptions: Array<{
    label: string;
    value: ScoreboardLayoutMode;
    description: string;
  }> = [
    {
      label: 'Current',
      value: 'current',
      description: 'Larger, scrollable frame strip while editing.',
    },
    {
      label: 'Compact',
      value: 'compact',
      description: 'Fit all 10 frames in one row.',
    },
  ];

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
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
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

        <Card muted style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Game entry</Text>
          <Text style={styles.meta}>Scoreboard layout</Text>

          <View style={styles.layoutOptionsRow}>
            {scoreboardLayoutOptions.map((option) => {
              const isActive = scoreboardLayout === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => setScoreboardLayout(option.value)}
                  style={({ pressed }) => [
                    styles.layoutOption,
                    isActive ? styles.layoutOptionActive : null,
                    pressed ? styles.layoutOptionPressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.layoutOptionLabel,
                      isActive ? styles.layoutOptionLabelActive : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.layoutOptionDescription,
                      isActive ? styles.layoutOptionDescriptionActive : null,
                    ]}
                  >
                    {option.description}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!isHydrated ? (
            <Text style={styles.meta}>Loading preference...</Text>
          ) : null}
        </Card>

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

const styles = StyleSheet.create({
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
  layoutOptionsRow: {
    gap: spacing.sm,
  },
  layoutOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  layoutOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  layoutOptionPressed: {
    opacity: 0.82,
  },
  layoutOptionLabel: {
    fontSize: typeScale.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  layoutOptionLabelActive: {
    color: colors.accent,
  },
  layoutOptionDescription: {
    fontSize: typeScale.bodySm,
    color: colors.textSecondary,
  },
  layoutOptionDescriptionActive: {
    color: colors.textPrimary,
  },
});
