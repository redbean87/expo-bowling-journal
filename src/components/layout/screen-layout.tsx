import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, lineHeight, radius, spacing, typeScale } from '@/theme/tokens';

type ScreenLayoutProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  fillCard?: boolean;
}>;

export function ScreenLayout({
  title,
  subtitle,
  fillCard = false,
  children,
}: ScreenLayoutProps) {
  return (
    <View style={[styles.container, fillCard ? styles.containerTop : null]}>
      <View style={[styles.card, fillCard ? styles.cardFill : null]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  card: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  containerTop: {
    justifyContent: 'flex-start',
  },
  cardFill: {
    flex: 1,
    minHeight: 0,
  },
  title: {
    fontSize: typeScale.hero,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typeScale.bodyLg,
    lineHeight: lineHeight.body,
    color: colors.textSecondary,
  },
});
