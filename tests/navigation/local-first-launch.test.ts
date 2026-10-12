// Proving test for the C-0 local-first launch.
//
// Renders the real root layout, the app shell, and the auth gate under the
// plain Node/tsx runner with no auth, no profile, and no server. The
// Convex client is a double that records and throws on any attempted
// operation, so the "zero Convex calls" assertion is about attempted
// operations, not about which provider is mounted (disabling the provider
// setup is a later conversion slice).
//
// While local mode is on:
// - the root renders the journal even while the session check is pending
//   (there is no session-check gate);
// - the journal navigation from the root into the app shell is intact;
// - the auth gate renders nothing: no sign-in form, no session-check
//   spinner, no server auth affordances;
// - no Convex query, mutation, or auth operation runs.

import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import React from 'react';

import { syncerMounts } from './stubs/game-save-queue-syncer.mjs';
import {
  clearConvexOps,
  convexOps,
  setTestAuthState,
} from './stubs/local-first/convex-react.mjs';

const require = createRequire(__filename);

// React resolves to the same instance as the app code, and renderToString
// comes from the CJS entry. The tsx runner compiles the app modules to the
// classic React.createElement runtime, which resolves `React` from scope;
// exposing the same instance on the global scope keeps that working.
Object.assign(globalThis, { React });

const {
  renderToString,
}: {
  renderToString: (node: unknown) => string;
} = require('react-dom/server');

// The root layout, the app provider tree, and the auth gate render under
// the plain Node/tsx runner. Their environment (expo, Convex, auth, the
// native UI surface) is remapped to local test doubles; the convex/react
// double records and throws on any attempted operation. The expo-router,
// theme, and queue-syncer doubles are shared with the D2 navigation suite.
const stubDir = path.join(__dirname, 'stubs');
const localFirstStub = (name: string) =>
  pathToFileURL(path.join(stubDir, 'local-first', name)).href;
const sharedStub = (name: string) =>
  pathToFileURL(path.join(stubDir, name)).href;

const stubUrls: Record<string, string> = {
  'convex/react': localFirstStub('convex-react.mjs'),
  '@convex-dev/auth/react': localFirstStub('convex-auth.mjs'),
  'expo-router': sharedStub('expo-router.mjs'),
  '@react-navigation/native': localFirstStub('navigation.mjs'),
  'react-native': localFirstStub('react-native.mjs'),
  'react-native-safe-area-context': localFirstStub('safe-area.mjs'),
  'expo-secure-store': localFirstStub('secure-store.mjs'),
  'expo-status-bar': localFirstStub('status-bar.mjs'),
  '@expo/vector-icons/MaterialIcons': localFirstStub('vector-icons.mjs'),
  '@/theme/use-app-theme': sharedStub('app-theme.mjs'),
  '@/providers/game-save-queue-syncer': sharedStub(
    'game-save-queue-syncer.mjs'
  ),
};

// The app modules read the Convex URL from process environment at import
// time; pin a throwaway value so importing the real provider tree does not
// depend on the machine environment.
process.env.EXPO_PUBLIC_CONVEX_URL ??=
  'https://local-first-launch.invalid/convex';

const hookHandle = registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubUrl = stubUrls[specifier];
    if (stubUrl !== undefined) {
      return nextResolve(stubUrl, context);
    }

    return nextResolve(specifier, context);
  },
});

after(() => {
  hookHandle.deregister();
});

type LaunchModules = {
  RootLayout: (typeof import('../../app/_layout'))['default'];
  AppLayout: (typeof import('../../app/(app)/_layout'))['default'];
  AuthGate: (typeof import('../../src/components/auth-gate'))['AuthGate'];
  AppProvider: (typeof import('../../src/providers/app-provider'))['AppProvider'];
  appProvider: typeof import('../../src/providers/app-provider');
};

let launchModulesPromise: Promise<LaunchModules> | null = null;

function getLaunchModules() {
  launchModulesPromise ??= Promise.all([
    import('../../app/_layout'),
    import('../../app/(app)/_layout'),
    import('../../src/components/auth-gate'),
    import('../../src/providers/app-provider'),
  ]).then(([rootModule, appLayoutModule, gateModule, appProviderModule]) => ({
    RootLayout: rootModule.default,
    AppLayout: appLayoutModule.default,
    AuthGate: gateModule.AuthGate,
    AppProvider: appProviderModule.AppProvider,
    appProvider: appProviderModule,
  }));

  return launchModulesPromise;
}

function render(element: unknown) {
  return renderToString(element);
}

function renderGateInProvider(
  modules: Pick<LaunchModules, 'AppProvider' | 'AuthGate'>
) {
  const { AppProvider, AuthGate } = modules;
  return render(
    React.createElement(AppProvider, null, React.createElement(AuthGate))
  );
}

test('the local-mode switch exists, is forced on, and is live in the provider tree', async () => {
  const { AppProvider, appProvider } = await getLaunchModules();

  assert.equal(typeof appProvider.useLocalMode, 'function');
  assert.equal(appProvider.LOCAL_MODE_ENABLED, true);

  const Probe = () =>
    React.createElement('test-local-mode', {
      'data-local-mode': appProvider.useLocalMode() ? 'on' : 'off',
    });

  const html = render(
    React.createElement(AppProvider, null, React.createElement(Probe))
  );

  assert.ok(html.includes('data-local-mode="on"'));
});

test('launch reaches the journal while the session check is pending (no session-check gate)', async () => {
  const { RootLayout } = await getLaunchModules();

  setTestAuthState({ isLoading: true, isAuthenticated: false });
  clearConvexOps();
  const html = render(React.createElement(RootLayout));

  assert.ok(
    html.length > 0,
    'the root must not render blank while the session check is pending'
  );
  assert.ok(html.includes('<test-stack'));
  assert.ok(html.includes('data-name="(app)"'));
  assert.ok(html.includes('data-name="(auth)"'));
  assert.deepEqual(convexOps, []);
});

test('launch reaches the journal when unauthenticated', async () => {
  const { RootLayout } = await getLaunchModules();

  setTestAuthState({ isLoading: false, isAuthenticated: false });
  clearConvexOps();
  const html = render(React.createElement(RootLayout));

  assert.ok(html.length > 0);
  assert.ok(html.includes('<test-stack'));
  assert.ok(html.includes('data-name="(app)"'));
  assert.deepEqual(convexOps, []);
});

test('journal navigation is intact from the root into the app shell', async () => {
  const { RootLayout, AppLayout } = await getLaunchModules();

  setTestAuthState({ isLoading: false, isAuthenticated: false });
  clearConvexOps();
  syncerMounts.length = 0;

  const rootHtml = render(React.createElement(RootLayout));
  const appHtml = render(React.createElement(AppLayout));

  assert.ok(rootHtml.includes('<test-stack'));
  assert.ok(rootHtml.includes('data-name="(app)"'));
  assert.ok(appHtml.includes('<test-stack'));
  assert.ok(appHtml.includes('data-name="(tabs)"'));
  assert.equal(syncerMounts.length, 0);
  assert.deepEqual(convexOps, []);
});

test('the auth gate renders nothing while local mode is on (settled, signed out)', async () => {
  const { AppProvider, AuthGate } = await getLaunchModules();

  setTestAuthState({ isLoading: false, isAuthenticated: false });
  clearConvexOps();
  const html = renderGateInProvider({ AppProvider, AuthGate });

  assert.equal(html, '');
  assert.deepEqual(convexOps, []);
});

test('the auth gate renders nothing while local mode is on (session check pending)', async () => {
  const { AppProvider, AuthGate } = await getLaunchModules();

  setTestAuthState({ isLoading: true, isAuthenticated: false });
  clearConvexOps();
  const html = renderGateInProvider({ AppProvider, AuthGate });

  assert.equal(html, '');
  assert.deepEqual(convexOps, []);
});

test('no Convex operation runs during launch, journal navigation, or the gate', async () => {
  const { RootLayout, AppLayout, AppProvider, AuthGate } =
    await getLaunchModules();

  clearConvexOps();

  setTestAuthState({ isLoading: true, isAuthenticated: false });
  render(React.createElement(RootLayout));

  setTestAuthState({ isLoading: false, isAuthenticated: false });
  render(React.createElement(RootLayout));
  render(React.createElement(AppLayout));
  renderGateInProvider({ AppProvider, AuthGate });

  assert.deepEqual(convexOps, []);
});
