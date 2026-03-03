import { Stack } from 'expo-router';

import { AppHeader } from '@/components/navigation/app-header';
import { useAppTheme } from '@/theme/use-app-theme';

export default function JournalLayout() {
  const { colors } = useAppTheme();
  return (
    <Stack
      screenOptions={{
        header: (props) => <AppHeader {...props} />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
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
        getId={({ params }) => {
          const gameId = params?.gameId as string | undefined;
          if (!gameId || gameId === 'new') {
            return `new-${(params?.draftNonce as string | undefined) ?? 'x'}`;
          }
          return gameId;
        }}
        options={{
          title: 'Game',
        }}
      />
    </Stack>
  );
}
