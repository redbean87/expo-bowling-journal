// Test double for '@react-navigation/native' used by the local-first launch
// tests: the ThemeProvider passes its children through as a marker element.

import { createElement } from 'react';

export const DarkTheme = { dark: true };

export const DefaultTheme = { dark: false };

export function ThemeProvider({ children }) {
  return createElement('test-theme-provider', null, children);
}
