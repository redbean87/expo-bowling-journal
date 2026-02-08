import { Text } from 'react-native';

import { AuthGate } from '@/components/auth-gate';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function HomeScreen() {
  return (
    <PlaceholderScreen
      title="Bowling Journal"
      subtitle="App shell is running. Data setup and game flows will land in upcoming roadmap items."
    >
      <Text>Start here to review recent sessions and quick stats.</Text>
      <AuthGate />
    </PlaceholderScreen>
  );
}
