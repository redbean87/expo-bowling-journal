import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { useRouter } from 'expo-router';

import { resolveUpTarget } from './app-header-route-utils';

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

export function AppHeader({ options, route }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const title = resolveHeaderTitle({ options, routeName: route.name });
  const upTarget = resolveUpTarget({
    routeName: route.name,
    params: route.params,
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        <View style={styles.sideSlot}>
          {upTarget ? (
            <Pressable
              accessibilityLabel="Go up"
              hitSlop={8}
              onPress={() => {
                router.replace(upTarget as never);
              }}
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
    backgroundColor: colors.surfaceSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  sideSlot: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  backButtonPressed: {
    backgroundColor: colors.accentMuted,
  },
  backButtonLabel: {
    fontSize: 16,
    lineHeight: 16,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  title: {
    flex: 1,
    fontSize: typeScale.titleSm,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
