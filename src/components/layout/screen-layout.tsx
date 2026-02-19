import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, lineHeight, radius, spacing, typeScale } from '@/theme/tokens';

type ScreenLayoutProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  fillCard?: boolean;
  hideHeader?: boolean;
  compact?: boolean;
  chromeless?: boolean;
}>;

export function ScreenLayout({
  title,
  subtitle,
  fillCard = false,
  hideHeader = false,
  compact = false,
  chromeless = false,
  children,
}: ScreenLayoutProps) {
  return (
    <View
      style={[
        styles.container,
        fillCard ? styles.containerTop : null,
        compact ? styles.containerCompact : null,
      ]}
    >
      <View
        style={[
          chromeless ? styles.content : styles.card,
          fillCard ? styles.cardFill : null,
          compact ? styles.cardCompact : null,
        ]}
      >
        {!hideHeader ? (
          <>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
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
  content: {
    flex: 1,
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  containerTop: {
    justifyContent: 'flex-start',
  },
  cardFill: {
    flex: 1,
    minHeight: 0,
  },
  containerCompact: {
    paddingTop: spacing.xs,
    paddingHorizontal: 0,
    paddingBottom: spacing.sm,
  },
  cardCompact: {
    gap: spacing.sm,
    padding: spacing.md,
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
