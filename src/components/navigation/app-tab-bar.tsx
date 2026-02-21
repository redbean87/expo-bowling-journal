import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { colors, spacing, typeScale } from '@/theme/tokens';

function resolveTabLabel({
  tabBarLabel,
  title,
  routeName,
}: {
  tabBarLabel: BottomTabBarProps['descriptors'][string]['options']['tabBarLabel'];
  title: string | undefined;
  routeName: string;
}) {
  if (typeof tabBarLabel === 'string' && tabBarLabel.length > 0) {
    return tabBarLabel;
  }

  if (typeof title === 'string' && title.length > 0) {
    return title;
  }

  return routeName;
}

export function AppTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const { options } = descriptors[route.key];
          const label = resolveTabLabel({
            tabBarLabel: options.tabBarLabel,
            title: options.title,
            routeName: route.name,
          });

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onLongPress={onLongPress}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tab,
                isFocused ? styles.tabFocused : null,
                pressed ? styles.tabPressed : null,
              ]}
              testID={options.tabBarButtonTestID}
            >
              <View
                style={[
                  styles.indicator,
                  isFocused ? styles.indicatorVisible : styles.indicatorHidden,
                ]}
              />
              <Text
                style={[
                  styles.label,
                  isFocused ? styles.labelFocused : styles.labelUnfocused,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    minHeight: 44,
  },
  tabFocused: {
    backgroundColor: colors.surfaceSubtle,
  },
  tabPressed: {
    opacity: 0.85,
  },
  indicator: {
    width: 22,
    height: 3,
    borderRadius: 99,
  },
  indicatorVisible: {
    backgroundColor: colors.accent,
  },
  indicatorHidden: {
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: typeScale.bodySm,
    fontWeight: '600',
  },
  labelFocused: {
    color: colors.accent,
  },
  labelUnfocused: {
    color: colors.textSecondary,
  },
});
