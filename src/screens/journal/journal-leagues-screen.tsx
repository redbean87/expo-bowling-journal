import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { useLeagues } from '@/hooks/journal';
import { colors } from '@/theme/tokens';

export default function JournalLeaguesScreen() {
  const router = useRouter();
  const {
    leagues,
    isLoading: isLeaguesLoading,
    createLeague,
    isCreating: isCreatingLeague,
  } = useLeagues();
  const [leagueName, setLeagueName] = useState('');
  const [leagueError, setLeagueError] = useState<string | null>(null);

  const onCreateLeague = async () => {
    setLeagueError(null);
    const name = leagueName.trim();

    if (name.length === 0) {
      setLeagueError('League name is required.');
      return;
    }

    try {
      const leagueId = await createLeague({ name });
      setLeagueName('');
      router.push({
        pathname: '/journal/[leagueId]/sessions' as never,
        params: { leagueId } as never,
      } as never);
    } catch (caught) {
      setLeagueError(
        caught instanceof Error ? caught.message : 'Unable to create league.'
      );
    }
  };

  return (
    <PlaceholderScreen
      title="Journal"
      subtitle="Start with a league, then drill into sessions and games."
      fillCard
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.formCard}>
          <TextInput
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setLeagueName}
            placeholder="League name"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={leagueName}
          />
          {leagueError ? (
            <Text style={styles.errorText}>{leagueError}</Text>
          ) : null}
          <Pressable
            disabled={isCreatingLeague}
            onPress={onCreateLeague}
            style={[
              styles.actionButton,
              isCreatingLeague ? styles.actionButtonDisabled : null,
            ]}
          >
            <Text style={styles.actionButtonLabel}>
              {isCreatingLeague ? 'Creating...' : 'Create league'}
            </Text>
          </Pressable>
        </View>

        {isLeaguesLoading ? (
          <Text style={styles.meta}>Loading leagues...</Text>
        ) : null}
        {!isLeaguesLoading && leagues.length === 0 ? (
          <Text style={styles.meta}>
            No leagues yet. Create your first league to get started.
          </Text>
        ) : null}

        {leagues.map((league) => (
          <Pressable
            key={league._id}
            onPress={() =>
              router.push({
                pathname: '/journal/[leagueId]/sessions' as never,
                params: { leagueId: league._id } as never,
              } as never)
            }
            style={styles.row}
          >
            <Text style={styles.rowTitle}>{league.name}</Text>
            <Text style={styles.meta}>
              {league.houseName ?? 'No house set'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 8,
  },
  scroll: {
    flex: 1,
  },
  formCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#F8FAFF',
  },
  input: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#B42318',
  },
  actionButton: {
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  row: {
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: colors.surface,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
