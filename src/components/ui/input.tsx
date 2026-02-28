import { forwardRef, useMemo } from 'react';
import {
  TextInput,
  type TextInputProps,
  type TextInput as RNTextInput,
  StyleSheet,
} from 'react-native';

import { radius, type ThemeColors, typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export const Input = forwardRef<RNTextInput, TextInputProps>(function Input(
  { style, placeholderTextColor, ...props },
  ref
) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TextInput
      ref={ref}
      placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
      style={[styles.input, style]}
      {...props}
    />
  );
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    input: {
      height: 42,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      paddingHorizontal: 12,
      fontSize: typeScale.body,
    },
  });
