import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

type PlaceholderScreenProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  fillCard?: boolean;
}>;

export function PlaceholderScreen({
  title,
  subtitle,
  fillCard = false,
  children,
}: PlaceholderScreenProps) {
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
    padding: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  card: {
    gap: 10,
    padding: 20,
    borderRadius: 16,
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
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
