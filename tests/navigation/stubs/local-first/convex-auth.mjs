// Test double for '@convex-dev/auth/react' used by the local-first launch
// tests. The provider double is pass-through: no session check runs. The
// auth actions record and throw, because invoking them would be a server
// call.

import { convexOps } from './convex-react.mjs';

export function ConvexAuthProvider({ children }) {
  return children;
}

export function useAuthActions() {
  return {
    signIn: (..._args) => {
      convexOps.push('auth:signIn');
      throw new Error('Convex auth signIn attempted in local mode');
    },
    signOut: () => {
      convexOps.push('auth:signOut');
      throw new Error('Convex auth signOut attempted in local mode');
    },
  };
}
