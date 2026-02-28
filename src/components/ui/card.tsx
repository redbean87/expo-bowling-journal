import { PropsWithChildren, useMemo } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { radius, spacing, type ThemeColors } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type CardProps = PropsWithChildren<{
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

type PressableCardProps = CardProps & {
  onPress: () => void;
  disabled?: boolean;
};

export function Card({ muted = false, style, children }: CardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.base, muted ? styles.muted : null, style]}>
      {children}
    </View>
  );
}

export function PressableCard({
  muted = false,
  style,
  onPress,
  disabled,
  children,
}: PressableCardProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        muted ? styles.muted : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      backgroundColor: colors.surface,
    },
    muted: {
      backgroundColor: colors.surfaceMuted,
    },
    pressed: {
      opacity: 0.82,
    },
    disabled: {
      opacity: 0.65,
    },
  });
