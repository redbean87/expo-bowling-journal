import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePwaUpdate } from '@/hooks/use-pwa-update';
import { colors, radius, spacing, typeScale } from '@/theme/tokens';

export function PwaUpdateBanner() {
  const insets = useSafeAreaInsets();
  const { isSupported, isUpdateAvailable, isApplying, applyUpdate } =
    usePwaUpdate();

  if (!isSupported || !isUpdateAvailable) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View style={[styles.banner, { marginTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Update available</Text>
        <Text style={styles.message}>
          A newer version is ready. Refresh now to apply it.
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={isApplying}
          onPress={applyUpdate}
          style={({ pressed }) => [
            styles.button,
            pressed && !isApplying ? styles.buttonPressed : null,
            isApplying ? styles.buttonDisabled : null,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {isApplying ? 'Updating...' : 'Update now'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2000,
  },
  banner: {
    alignSelf: 'center',
    backgroundColor: colors.textPrimary,
    borderColor: '#121621',
    borderRadius: radius.lg,
    borderWidth: 1,
    maxWidth: 520,
    padding: spacing.lg,
    width: '92%',
  },
  title: {
    color: '#FFFFFF',
    fontSize: typeScale.titleSm,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  message: {
    color: '#D8DEE9',
    fontSize: typeScale.body,
    marginBottom: spacing.md,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: colors.accentText,
    fontSize: typeScale.body,
    fontWeight: '700',
  },
});
