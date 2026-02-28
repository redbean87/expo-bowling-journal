import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferences } from '@/providers/preferences-provider';
import {
  createTheme,
  darkColors,
  lightColors,
  withThemeFlavor,
} from '@/theme/tokens';

export type ResolvedColorMode = 'light' | 'dark';

export function useAppTheme() {
  const { colorModePreference, themeFlavorPreference } = usePreferences();
  const systemColorScheme = useColorScheme();

  const resolvedColorMode: ResolvedColorMode =
    colorModePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : colorModePreference;

  const baseColors = resolvedColorMode === 'dark' ? darkColors : lightColors;
  const colors = useMemo(
    () => withThemeFlavor(baseColors, resolvedColorMode, themeFlavorPreference),
    [baseColors, resolvedColorMode, themeFlavorPreference]
  );

  const theme = useMemo(() => createTheme(colors), [colors]);

  return {
    theme,
    colors,
    mode: resolvedColorMode,
    preference: colorModePreference,
    flavor: themeFlavorPreference,
  };
}
