import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';

import { colors, spacing, typeScale } from '@/theme/tokens';

type AppHeaderProps = NativeStackHeaderProps | BottomTabHeaderProps;

function resolveHeaderTitle({
  options,
  routeName,
}: {
  options: AppHeaderProps['options'];
  routeName: string;
}) {
  if (
    typeof options.headerTitle === 'string' &&
    options.headerTitle.length > 0
  ) {
    return options.headerTitle;
  }

  if (typeof options.title === 'string' && options.title.length > 0) {
    return options.title;
  }

  return routeName;
}

export function AppHeader({ navigation, options, route }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const title = resolveHeaderTitle({ options, routeName: route.name });
  const canGoBack = navigation.canGoBack();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <View style={styles.sideSlot}>
          {canGoBack ? (
            <Pressable
              accessibilityLabel="Go back"
              hitSlop={8}
              onPress={navigation.goBack}
              style={({ pressed }) => [
                styles.backButton,
                pressed ? styles.backButtonPressed : null,
              ]}
            >
              <Text style={styles.backButtonLabel}>{'<'}</Text>
            </Pressable>
          ) : null}
        </View>

        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>

        <View style={styles.sideSlot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  sideSlot: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    backgroundColor: colors.accentMuted,
  },
  backButtonLabel: {
    fontSize: 24,
    lineHeight: 24,
    color: colors.textPrimary,
    fontWeight: '400',
  },
  title: {
    flex: 1,
    fontSize: typeScale.titleSm,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
