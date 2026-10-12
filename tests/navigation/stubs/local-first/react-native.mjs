// Minimal 'react-native' double for the local-first launch tests: just
// enough surface for the root layout, the app provider tree, and the auth
// gate to render under plain Node. Components render marker elements that
// keep their children.

import { createElement } from 'react';

export const Platform = { OS: 'web' };

export const StyleSheet = {
  create: (styles) => styles,
  flatten: () => ({}),
};

export function View({ children }) {
  return createElement('test-view', null, children);
}

export function Text({ children }) {
  return createElement('test-text', null, children);
}

export function Pressable({ children }) {
  return createElement('test-pressable', null, children);
}

export function TouchableOpacity({ children }) {
  return createElement('test-touchable', null, children);
}

export function ActivityIndicator() {
  return createElement('test-activity-indicator');
}

export function TextInput() {
  return createElement('test-text-input');
}

export function useColorScheme() {
  return 'light';
}
