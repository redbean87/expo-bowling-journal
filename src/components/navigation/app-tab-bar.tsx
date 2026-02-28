import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { spacing, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type NestedRouteState = {
  index: number;
  routes: Array<{
    name: string;
    state?: NestedRouteState;
  }>;
};

function resolveDeepestRouteName(
  state: NestedRouteState | undefined
): string | null {
  if (!state) {
    return null;
  }

  const activeRoute = state.routes[state.index];

  if (!activeRoute) {
    return null;
  }

  if (activeRoute.state) {
    return resolveDeepestRouteName(activeRoute.state);
  }

  return activeRoute.name;
}

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const activeTab = state.routes[state.index];
  const activeNestedRouteName = resolveDeepestRouteName(
    (activeTab.state as NestedRouteState | undefined) ?? undefined
  );
  const shouldHideTabBar =
    activeTab.name === 'journal' &&
    activeNestedRouteName === '[leagueId]/sessions/[sessionId]/games/[gameId]';

  if (shouldHideTabBar) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) },
      ]}
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

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surfaceSubtle,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderStrong,
      paddingTop: spacing.xs,
      elevation: 8,
      shadowColor: colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: -2,
      },
    },
    row: {
      flexDirection: 'row',
      paddingHorizontal: spacing.xs,
      gap: spacing.xs,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      gap: spacing.xs,
      minHeight: 48,
      borderRadius: 12,
    },
    tabFocused: {
      backgroundColor: colors.accentMuted,
    },
    tabPressed: {
      opacity: 0.92,
    },
    indicator: {
      width: 26,
      height: 4,
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
      fontWeight: '700',
    },
    labelFocused: {
      color: colors.accent,
    },
    labelUnfocused: {
      color: colors.textPrimary,
      opacity: 0.84,
    },
  });
