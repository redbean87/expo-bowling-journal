import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { Card } from '@/components/ui';
import { env } from '@/config/env';
import { viewerQuery } from '@/convex/functions';
import { useExportSqliteBackup, useImportBackup } from '@/hooks/journal';
import { usePreferences } from '@/providers/preferences-provider';
import { ProfileAccountCard } from '@/screens/profile/profile-account-card';
import { ProfileDataExportSection } from '@/screens/profile/profile-data-export-section';
import { ProfileDataImportSection } from '@/screens/profile/profile-data-import-section';
import { ProfilePreferencesCard } from '@/screens/profile/profile-preferences-card';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function ProfileScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const viewer = useQuery(viewerQuery, isAuthenticated ? {} : 'skip');
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
        <ProfileAccountCard
          email={viewer?.email ?? undefined}
          onSignOut={() => void signOut()}
        />

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
            disabled={!isAuthenticated || !env.importWorkerUrl}
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
              void startBackupImport(
                env.importWorkerUrl,
                viewer?.userId ?? null
              )
            }
            selectedFileLabel={selectedFileLabel}
            uploadDisabled={
              !isAuthenticated || !env.importWorkerUrl || !selectedFileLabel
            }
          />
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
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
  });
