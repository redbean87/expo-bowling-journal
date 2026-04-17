import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui';
import { buildInfo } from '@/config/build-info';
import { env } from '@/config/env';
import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

function truncateUrl(url: string | null | undefined): string {
  if (!url) return 'Not configured';
  return url
    .replace(/^https?:\/\//, '')
    .replace(/\.workers\.dev.*$/, '.workers.dev');
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createRowStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );
}

const createRowStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      gap: spacing.xs,
    },
    label: {
      fontSize: typeScale.bodySm,
      color: colors.textSecondary,
    },
    value: {
      fontSize: typeScale.bodySm,
      color: colors.textPrimary,
      fontWeight: '500',
    },
  });

export function ProfileBuildInfoCard() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Card muted style={styles.card}>
      <Text style={styles.sectionTitle}>Build Info</Text>

      <View style={styles.infoList}>
        <InfoRow label="Version" value={buildInfo.version} />
        <InfoRow label="Build" value={buildInfo.gitSha} />
        <InfoRow label="Built" value={buildInfo.buildTime} />
        <InfoRow label="Worker" value={truncateUrl(env.importWorkerUrl)} />
        <InfoRow label="Backend" value={truncateUrl(env.convexUrl)} />
      </View>
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      gap: spacing.md,
    },
    sectionTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    infoList: {
      gap: spacing.sm,
    },
  });
