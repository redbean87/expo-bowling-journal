import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typeScale } from '@/theme/tokens';

type FloatingActionButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
};

export function FloatingActionButton({
  onPress,
  accessibilityLabel,
  disabled = false,
}: FloatingActionButtonProps) {
  return (
    <View pointerEvents="box-none" style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          pressed ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Text style={styles.plusLabel}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 6,
  },
  plusLabel: {
    color: colors.accentText,
    fontSize: typeScale.hero,
    lineHeight: typeScale.hero,
    fontWeight: '500',
    marginTop: -2,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.6,
  },
});
