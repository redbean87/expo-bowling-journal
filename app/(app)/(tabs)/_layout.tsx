import { Tabs } from 'expo-router';

import { AppHeader } from '@/components/navigation/app-header';
import { AppTabBar } from '@/components/navigation/app-tab-bar';
import { useAppTheme } from '@/theme/use-app-theme';

export default function TabsLayout() {
  const { colors } = useAppTheme();
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        header: (props) => <AppHeader {...props} />,
        sceneStyle: { backgroundColor: colors.background },
      }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarLabel: 'Journal',
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarLabel: 'Analytics',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
        }}
      />
    </Tabs>
  );
}
