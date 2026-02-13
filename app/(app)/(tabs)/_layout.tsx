import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerTitleAlign: 'center',
      }}
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
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
        }}
      />
    </Tabs>
  );
}
