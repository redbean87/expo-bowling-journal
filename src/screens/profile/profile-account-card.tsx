import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Card } from '@/components/ui';
import {
  lineHeight,
  spacing,
  type ThemeColors,
  typeScale,
} from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type ProfileAccountCardProps = {
  email: string | undefined;
  onSignOut: () => void;
};

export function ProfileAccountCard({
  email,
  onSignOut,
}: ProfileAccountCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Card muted style={styles.card}>
      <Text style={styles.sectionTitle}>Account</Text>
      <Text style={styles.meta}>
        {email ? `Signed in as ${email}` : 'Signed in'}
      </Text>
      <Pressable
        onPress={onSignOut}
        style={({ pressed }) => [
          styles.inlineAction,
          pressed ? styles.inlineActionPressed : null,
        ]}
      >
        <Text style={styles.inlineActionLabel}>Sign out</Text>
      </Pressable>
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      gap: spacing.sm,
    },
    sectionTitle: {
      fontSize: typeScale.titleSm,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    meta: {
      fontSize: typeScale.bodySm,
      lineHeight: lineHeight.compact,
      color: colors.textSecondary,
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
  });
