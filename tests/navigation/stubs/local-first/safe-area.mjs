// Test double for 'react-native-safe-area-context' used by the local-first
// launch tests.

export function SafeAreaProvider({ children }) {
  return children;
}

export function useSafeAreaInsets() {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}
