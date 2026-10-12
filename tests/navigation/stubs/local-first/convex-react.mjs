// Operation-recording test double for 'convex/react' used by the
// local-first launch tests.
//
// The double models a Convex client that throws on any attempted operation:
// executing a query, calling a mutation, or invoking a client method records
// the operation in `convexOps` and throws. Binding a hook is not an
// operation, and a `useQuery` bound with `'skip'` executes nothing and
// records nothing. Auth state is controlled per test by the test file; no
// Convex client connects.

const authState = {
  isLoading: true,
  isAuthenticated: false,
};

/** Every attempted Convex operation, in order (e.g. `query:viewers`). */
export const convexOps = [];

export function setTestAuthState(nextState) {
  authState.isLoading = nextState.isLoading;
  authState.isAuthenticated = nextState.isAuthenticated;
}

export function clearConvexOps() {
  convexOps.length = 0;
}

function operationName(fn) {
  if (typeof fn === 'string') {
    return fn;
  }

  return (fn && (fn._name || fn.name)) || String(fn);
}

export function useConvexAuth() {
  return authState;
}

export function useQuery(fn, arg) {
  if (arg === 'skip') {
    return undefined;
  }

  const name = operationName(fn);
  convexOps.push(`query:${name}`);
  throw new Error(`Convex query attempted in local mode: ${name}`);
}

export function useMutation(fn) {
  const name = operationName(fn);

  return function invokeMutation() {
    convexOps.push(`mutation:${name}`);
    throw new Error(`Convex mutation attempted in local mode: ${name}`);
  };
}

export function useConvex() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        const name = String(prop);

        return (..._args) => {
          convexOps.push(`client:${name}`);
          throw new Error(
            `Convex client method attempted in local mode: ${name}`
          );
        };
      },
    }
  );
}

export class ConvexReactClient {
  constructor(url) {
    this.url = url;
  }
}

export function ConvexProvider({ children }) {
  return children;
}

export function AuthLoading({ children }) {
  return authState.isLoading ? children : null;
}

export function Authenticated({ children }) {
  return !authState.isLoading && authState.isAuthenticated ? children : null;
}

export function Unauthenticated({ children }) {
  return !authState.isLoading && !authState.isAuthenticated ? children : null;
}
