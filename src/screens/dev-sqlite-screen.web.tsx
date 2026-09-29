/**
 * Web platform override for the development-only SQLite diagnostics screen.
 *
 * The base implementation (`dev-sqlite-screen.tsx`) statically imports the
 * local SQLite database layer, which depends on `expo-sqlite`. `expo-sqlite`
 * cannot bundle for web, so the web module graph must not reach it. Metro
 * resolves this `.web` override on the web platform and the base file on
 * native platforms, so the native diagnostics are fully preserved while the
 * web bundle never imports `expo-sqlite`.
 */
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ScreenLayout } from '@/components/layout/screen-layout';
import { lineHeight, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function DevSqliteScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScreenLayout title="SQLite Diagnostics" subtitle="Web build">
      <Text style={styles.muted}>
        SQLite diagnostics are available on native development builds.
      </Text>
    </ScreenLayout>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    muted: {
      fontSize: typeScale.body,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
    },
  });
