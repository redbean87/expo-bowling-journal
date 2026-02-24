import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveUpTarget } from './app-header-route-utils';

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

function resolveHeaderSubtitle(options: AppHeaderProps['options']) {
  if (
    typeof options.headerTitle === 'string' &&
    options.headerTitle.length > 0 &&
    typeof options.title === 'string' &&
    options.title.length > 0 &&
    options.title !== options.headerTitle
  ) {
    return options.title;
  }

  return null;
}

export function AppHeader({ options, route }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const title = resolveHeaderTitle({ options, routeName: route.name });
  const subtitle = resolveHeaderSubtitle(options);
  const upTarget = resolveUpTarget({
    routeName: route.name,
    params: route.params,
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View
        style={[
          styles.row,
          subtitle ? styles.rowWithSubtitle : styles.rowSingle,
        ]}
      >
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
              <MaterialIcons
                name="arrow-back"
                size={22}
                color={colors.textPrimary}
              />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.titleStack}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={styles.subtitle}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  rowSingle: {
    minHeight: 58,
  },
  rowWithSubtitle: {
    minHeight: 64,
  },
  sideSlot: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButton: {
    width: 40,
    height: 44,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  backButtonPressed: {
    backgroundColor: colors.accentMuted,
  },
  titleStack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  title: {
    fontSize: typeScale.titleSm,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    maxWidth: '95%',
  },
  subtitle: {
    fontSize: typeScale.bodySm,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.2,
    maxWidth: '92%',
  },
});
