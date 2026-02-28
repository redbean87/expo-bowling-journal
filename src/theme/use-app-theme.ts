import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferences } from '@/providers/preferences-provider';
import { createTheme, darkColors, lightColors } from '@/theme/tokens';

export type ResolvedColorMode = 'light' | 'dark';

export function useAppTheme() {
  const { colorModePreference } = usePreferences();
  const systemColorScheme = useColorScheme();

  const resolvedColorMode: ResolvedColorMode =
    colorModePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : colorModePreference;

  const colors = resolvedColorMode === 'dark' ? darkColors : lightColors;

  const theme = useMemo(() => createTheme(colors), [colors]);

  return {
    theme,
    colors,
    mode: resolvedColorMode,
    preference: colorModePreference,
  };
}
