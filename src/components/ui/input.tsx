import { forwardRef } from 'react';
import {
  TextInput,
  type TextInputProps,
  type TextInput as RNTextInput,
  StyleSheet,
} from 'react-native';

import { colors, radius, typeScale } from '@/theme/tokens';

export const Input = forwardRef<RNTextInput, TextInputProps>(function Input(
  { style, placeholderTextColor, ...props },
  ref
) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
      style={[styles.input, style]}
      {...props}
    />
  );
});

const styles = StyleSheet.create({
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
