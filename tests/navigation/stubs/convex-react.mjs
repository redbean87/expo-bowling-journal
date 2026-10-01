// Test double for 'convex/react' used by the D2 navigation tests.
// Auth state is controlled per-test by the test file; no Convex client is created.
const authState = {
  isLoading: true,
  isAuthenticated: false,
};

export function setTestAuthState(nextState) {
  authState.isLoading = nextState.isLoading;
  authState.isAuthenticated = nextState.isAuthenticated;
}

export function useConvexAuth() {
  return authState;
}

export function useMutation() {
  return () => {};
}
