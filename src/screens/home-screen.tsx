import { StyleSheet, Text, View } from 'react-native';

import { AuthGate } from '@/components/auth-gate';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { useLeagues } from '@/hooks/journal';
import { colors } from '@/theme/tokens';

export default function HomeScreen() {
  const { leagues, isLoading, isAuthenticated } = useLeagues();

  return (
    <PlaceholderScreen
      title="Bowling Journal"
      subtitle="Home now shows live Convex status while auth and core flows continue to expand."
    >
      <View style={styles.card}>
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
      </View>

      <AuthGate />
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
