import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ProfileDataExportSectionProps = {
  isExporting: boolean;
  exportError: string | null;
  lastExportFileName: string | null;
  onExport: () => void;
  disabled: boolean;
};

export function ProfileDataExportSection({
  isExporting,
  exportError,
  lastExportFileName,
  onExport,
  disabled,
}: ProfileDataExportSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.section}>
      <Text style={styles.subLabel}>Export</Text>
      <Text style={styles.meta}>
        Download a full SQLite backup of your data.
      </Text>
      <Button
        disabled={disabled || isExporting}
        label={isExporting ? 'Exporting...' : 'Export SQLite backup (.db)'}
        onPress={onExport}
        variant="secondary"
      />
      {isExporting ? (
        <View style={styles.inlineRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.meta}>Exporting backup...</Text>
        </View>
      ) : null}
      {lastExportFileName ? (
        <Text style={styles.meta}>Exported: {lastExportFileName}</Text>
      ) : null}
      {exportError ? <Text style={styles.errorText}>{exportError}</Text> : null}
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
  });
