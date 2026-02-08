import { Text } from 'react-native';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ProfileScreen() {
  return (
    <PlaceholderScreen
      title="Profile"
      subtitle="Settings, import, and account actions will be added after core journal features."
    >
      <Text>Upcoming: timezone, preferences, and data import controls.</Text>
    </PlaceholderScreen>
  );
}
