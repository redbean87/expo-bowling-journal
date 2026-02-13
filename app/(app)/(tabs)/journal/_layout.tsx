import { Stack } from 'expo-router';

export default function JournalLayout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Leagues',
        }}
      />
      <Stack.Screen
        name="[leagueId]/sessions/index"
        options={{
          title: 'Sessions',
        }}
      />
      <Stack.Screen
        name="[leagueId]/sessions/[sessionId]/games/index"
        options={{
          title: 'Games',
        }}
      />
      <Stack.Screen
        name="[leagueId]/sessions/[sessionId]/games/[gameId]"
        options={{
          title: 'Game',
        }}
      />
    </Stack>
  );
}
