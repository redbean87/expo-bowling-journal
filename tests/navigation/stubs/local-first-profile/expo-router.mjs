// Test double for 'expo-router' used by the local-first profile reads
// test: navigation is a no-op; the profile screen renders without a
// router.
export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    canGoBack: () => false,
  };
}

export function useLocalSearchParams() {
  return {};
}

export function useNavigation() {
  return {};
}
