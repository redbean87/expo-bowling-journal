import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Card } from '@/components/ui';
import { env } from '@/config/env';
import { useExportSqliteBackup, useImportBackup } from '@/hooks/journal';
import { usePreferences } from '@/providers/preferences-provider';
import { ProfileBuildInfoCard } from '@/screens/profile/profile-build-info-card';
import { ProfileDataExportSection } from '@/screens/profile/profile-data-export-section';
import { ProfileDataImportSection } from '@/screens/profile/profile-data-import-section';
import { ProfilePreferencesCard } from '@/screens/profile/profile-preferences-card';
import { LOCAL_JOURNAL_USER_ID } from '@/services/journal/local-reads';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
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
  const {
    scoreboardLayout,
    setScoreboardLayout,
    colorModePreference,
    setColorModePreference,
    themeFlavorPreference,
    setThemeFlavorPreference,
    quickEntryMode,
    setQuickEntryMode,
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
        <ProfilePreferencesCard
          colorModePreference={colorModePreference}
          isHydrated={isHydrated}
          quickEntryMode={quickEntryMode}
          scoreboardLayout={scoreboardLayout}
          setColorModePreference={setColorModePreference}
          setQuickEntryMode={setQuickEntryMode}
          setScoreboardLayout={setScoreboardLayout}
          setThemeFlavorPreference={setThemeFlavorPreference}
          themeFlavorPreference={themeFlavorPreference}
        />

        <Card muted style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Data</Text>

          <ProfileDataExportSection
            disabled={!env.importWorkerUrl}
            exportError={exportError}
            isExporting={isExporting}
            lastExportFileName={lastExportFileName}
            onExport={() => void exportSqliteBackup(env.importWorkerUrl)}
          />

          <View style={styles.divider} />

          <ProfileDataImportSection
            error={error}
            importStatus={importStatus}
            isUploading={isUploading}
            onPickFile={() => void pickBackupFile()}
            onStartImport={() =>
              void startBackupImport(env.importWorkerUrl, LOCAL_JOURNAL_USER_ID)
            }
            selectedFileLabel={selectedFileLabel}
            uploadDisabled={!env.importWorkerUrl || !selectedFileLabel}
          />
        </Card>

        <ProfileBuildInfoCard />

        {__DEV__ ? (
          <Card muted style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Developer</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/dev-sqlite' as never)}
              style={styles.devRow}
            >
              <View style={styles.devRowText}>
                <Text style={styles.devRowLabel}>SQLite diagnostics</Text>
                <Text style={styles.devRowMeta}>
                  Local database checks: open, init, tables, foreign keys,
                  read/write.
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </Card>
        ) : null}
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
    devRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    devRowText: {
      flex: 1,
      gap: spacing.xs,
    },
    devRowLabel: {
      fontSize: typeScale.body,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    devRowMeta: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    chevron: {
      fontSize: typeScale.title,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
  });
