import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { useImportBackup } from '@/hooks/journal';

import { Button } from '@/components/ui';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ProfileDataImportSectionProps = {
  selectedFileLabel: string | null;
  isUploading: boolean;
  importStatus: ReturnType<typeof useImportBackup>['importStatus'];
  error: string | null;
  onPickFile: () => void;
  onStartImport: () => void;
  uploadDisabled: boolean;
};

function formatDate(value: number | null) {
  if (!value) {
    return 'Not completed yet';
  }

  return new Date(value).toLocaleString();
}

export function ProfileDataImportSection({
  selectedFileLabel,
  isUploading,
  importStatus,
  error,
  onPickFile,
  onStartImport,
  uploadDisabled,
}: ProfileDataImportSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showImportDetails, setShowImportDetails] = useState(false);

  const status = importStatus?.status ?? null;
  const isImporting =
    status === 'queued' || status === 'parsing' || status === 'importing';

  return (
    <View style={styles.section}>
      <Text style={styles.subLabel}>Import</Text>
      <Text style={styles.meta}>Restore from a .db backup file.</Text>

      <Button
        label="Choose backup file"
        onPress={onPickFile}
        variant="secondary"
      />

      {selectedFileLabel ? (
        <Text style={styles.meta}>{selectedFileLabel}</Text>
      ) : null}

      {selectedFileLabel ? (
        <Button
          disabled={uploadDisabled || isUploading}
          label={isUploading ? 'Uploading...' : 'Upload and start import'}
          onPress={onStartImport}
          variant="primary"
        />
      ) : null}

      {isUploading ? (
        <View style={styles.inlineRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.meta}>Uploading...</Text>
        </View>
      ) : null}

      {importStatus ? (
        <View style={styles.progressBlock}>
          <View style={styles.rowBetween}>
            <Text style={styles.subLabel}>Import progress</Text>
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
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      gap: spacing.sm,
    },
    subLabel: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textSecondary,
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
    progressBlock: {
      gap: spacing.sm,
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
