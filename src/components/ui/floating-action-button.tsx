import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { spacing, type ThemeColors } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
        <MaterialIcons name="add" size={28} color={colors.accentText} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      shadowColor: colors.shadowStrong,
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 4,
      },
      elevation: 6,
    },
    pressed: {
      opacity: 0.85,
      transform: [{ scale: 0.97 }],
    },
    disabled: {
      opacity: 0.6,
    },
  });
