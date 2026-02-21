import { StyleSheet, Text } from 'react-native';

import { AuthGate } from '@/components/auth-gate';
import { ScreenLayout } from '@/components/layout/screen-layout';
import { Card } from '@/components/ui';
import { useLeagues } from '@/hooks/journal';
import { colors, lineHeight, typeScale } from '@/theme/tokens';

export default function HomeScreen() {
  const { leagues, isLoading, isAuthenticated } = useLeagues();

  return (
    <ScreenLayout
      title="Bowling Journal"
      subtitle="Home now shows live Convex status while auth and core flows continue to expand."
      hideHeader
    >
      <Card>
        <Text style={styles.title}>Live Data</Text>
        <Text style={styles.meta}>
          {isLoading
            ? 'Loading your league summary...'
            : isAuthenticated
              ? `Leagues tracked: ${leagues.length}`
              : 'Sign in to load your live journal summary.'}
        </Text>
        <Text style={styles.hint}>
          Live data syncs automatically. If you just added records, pull to
          refresh or revisit this tab.
        </Text>
      </Card>

      <AuthGate />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typeScale.titleSm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typeScale.body,
    color: colors.textSecondary,
  },
  hint: {
    fontSize: typeScale.bodySm,
    lineHeight: lineHeight.compact,
    color: colors.textSecondary,
  },
});
