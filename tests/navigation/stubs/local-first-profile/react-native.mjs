// 'react-native' double for the local-first profile reads test: enough
// surface for the real profile screen (its data and preference cards, the
// layout, and the app provider tree) to render under plain Node.
// Components render marker elements that keep their children.

import { createElement } from 'react';

export const Platform = {
  OS: 'web',
  select: (config) => (config.web !== undefined ? config.web : config.default),
  version: null,
};

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

export function ScrollView({ children }) {
  return createElement('test-scroll-view', null, children);
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

export function Switch() {
  return createElement('test-switch');
}

export function Modal() {
  return null;
}

export const Alert = {
  alert: (..._args) => {},
  alertWithButtons: (..._args) => {},
  prompt: (..._args) => {},
};

export const AppState = {
  currentState: 'active',
  addEventListener: (_event, _listener) => ({ remove: () => {} }),
};

export function useColorScheme() {
  return 'light';
}

export function useWindowDimensions() {
  return { width: 390, height: 844, fontScale: 1, scale: 2 };
}
