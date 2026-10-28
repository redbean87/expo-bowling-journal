// Proving test for the C-1d local-first profile reads (auth gate and
// profile screen).
//
// Renders the real auth gate and the real profile screen (with its data
// export/import sections and preferences card) under the plain Node/tsx
// runner with the server connection sabotaged: the Convex client is a
// double that records and throws on any attempted operation, so
// "zero Convex reads" means zero attempted operations — in every auth
// state, including the worst case, a settled signed-in session left over
// from the sign-in era.
//
// While local mode is on:
// - the auth gate renders nothing and asks no viewer query — not even
//   when the device still carries a settled signed-in session;
// - the profile screen renders its surfaces from local state
//   (preferences, data export, data import, build info) with no account
//   card, no sign-in affordances, and no viewer read;
// - no Convex query, mutation, or auth operation runs.

import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import React from 'react';

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

// The profile screen renders its developer section behind the bundler's
// __DEV__ flag; render as a production build.
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const {
  renderToString,
}: {
  renderToString: (node: unknown) => string;
} = require('react-dom/server');

// The profile screen, the app provider tree, and the auth gate render
// under the plain Node/tsx runner. Their environment (expo, Convex,
// auth, the native UI surface) is remapped to local test doubles; the
// convex/react double records and throws on any attempted operation.
// The profile suite keeps its own doubles because it needs a wider native
// UI surface (ScrollView, Switch, ...) and a no-op router than the launch
// suite's.
const stubDir = path.join(__dirname, 'stubs');
const localFirstStub = (name: string) =>
  pathToFileURL(path.join(stubDir, 'local-first', name)).href;
const profileStub = (name: string) =>
  pathToFileURL(path.join(stubDir, 'local-first-profile', name)).href;
const sharedStub = (name: string) =>
  pathToFileURL(path.join(stubDir, name)).href;

const stubUrls: Record<string, string> = {
  'convex/react': localFirstStub('convex-react.mjs'),
  '@convex-dev/auth/react': localFirstStub('convex-auth.mjs'),
  '@react-navigation/native': localFirstStub('navigation.mjs'),
  'react-native': profileStub('react-native.mjs'),
  'react-native-safe-area-context': localFirstStub('safe-area.mjs'),
  'expo-secure-store': localFirstStub('secure-store.mjs'),
  'expo-status-bar': localFirstStub('status-bar.mjs'),
  '@expo/vector-icons/MaterialIcons': localFirstStub('vector-icons.mjs'),
  '@/theme/use-app-theme': profileStub('app-theme.mjs'),
  '@/providers/game-save-queue-syncer': sharedStub(
    'game-save-queue-syncer.mjs'
  ),
  'expo-router': profileStub('expo-router.mjs'),
  'expo-document-picker': profileStub('expo-document-picker.mjs'),
  'expo-file-system/legacy': profileStub('expo-file-system.mjs'),
  'expo-sharing': profileStub('expo-sharing.mjs'),
  '@react-native-async-storage/async-storage': profileStub('async-storage.mjs'),
  'expo-sqlite': pathToFileURL(
    path.join(stubDir, '..', '..', 'db', 'expo-sqlite-stub.mjs')
  ).href,
};

// The app modules read the Convex URL from process environment at import
// time; pin a throwaway value so importing the real provider tree does not
// depend on the machine environment. The import worker URL stays unset:
// the profile renders its data section with the worker URL absent.
process.env.EXPO_PUBLIC_CONVEX_URL ??=
  'https://local-first-profile-reads.invalid/convex';

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

type ProfileModules = {
  AppProvider: (typeof import('../../src/providers/app-provider'))['AppProvider'];
  AuthGate: (typeof import('../../src/components/auth-gate'))['AuthGate'];
  ProfileScreen: (typeof import('../../src/screens/profile-screen'))['default'];
};

let profileModulesPromise: Promise<ProfileModules> | null = null;

function getProfileModules() {
  profileModulesPromise ??= Promise.all([
    import('../../src/providers/app-provider'),
    import('../../src/components/auth-gate'),
    import('../../src/screens/profile-screen'),
  ]).then(([appProviderModule, gateModule, profileModule]) => ({
    AppProvider: appProviderModule.AppProvider,
    AuthGate: gateModule.AuthGate,
    ProfileScreen: profileModule.default,
  }));

  return profileModulesPromise;
}

function render(element: unknown) {
  return renderToString(element);
}

function renderInProvider(
  modules: Pick<ProfileModules, 'AppProvider'>,
  element: React.ReactElement
) {
  const { AppProvider } = modules;
  return render(React.createElement(AppProvider, null, element));
}

type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
};

// The three auth states the double can hold. The settled signed-in state
// is the worst case: a device that still carries a session from the
// sign-in era.
const authStates: Array<{ label: string; state: AuthState }> = [
  {
    label: 'with a settled signed-in session',
    state: { isLoading: false, isAuthenticated: true },
  },
  {
    label: 'with a settled signed-out session',
    state: { isLoading: false, isAuthenticated: false },
  },
  {
    label: 'with a pending session check',
    state: { isLoading: true, isAuthenticated: false },
  },
];

// --- The auth gate --------------------------------------------------------

for (const { label, state } of authStates) {
  test(`the auth gate renders nothing ${label} (no viewer query)`, async () => {
    const { AppProvider, AuthGate } = await getProfileModules();

    setTestAuthState(state);
    clearConvexOps();
    const html = renderInProvider(
      { AppProvider },
      React.createElement(AuthGate)
    );

    assert.equal(html, '');
    assert.deepEqual(convexOps, []);
  });
}

// --- The profile screen ----------------------------------------------------

for (const { label, state } of authStates) {
  test(`the profile screen renders from local state ${label} (no viewer query)`, async () => {
    const { AppProvider, ProfileScreen } = await getProfileModules();

    setTestAuthState(state);
    clearConvexOps();
    const html = renderInProvider(
      { AppProvider },
      React.createElement(ProfileScreen)
    );

    assert.ok(html.length > 0, 'the profile screen must not render blank');

    // The surfaces render from local state.
    assert.ok(html.includes('Preferences'), 'preferences card missing');
    assert.ok(html.includes('Entry mode'), 'entry mode row missing');
    assert.ok(html.includes('Data'), 'data section missing');
    assert.ok(
      html.includes('Export journal backup (.json)'),
      'export button missing'
    );
    assert.ok(
      html.includes('Restore from a .db backup file.'),
      'import section missing'
    );
    assert.ok(
      html.includes('Choose backup file'),
      'import pick button missing'
    );
    assert.ok(html.includes('Build Info'), 'build info card missing');
    assert.ok(html.includes('1.0.0'), 'build version missing');

    // The sign-in-era account surface is gone with it.
    assert.ok(!html.includes('Account'), 'account card must be absent');
    assert.ok(!html.includes('Sign out'), 'sign-out must be absent');

    // Zero Convex reads: nothing on this screen touches the server.
    assert.deepEqual(convexOps, []);
  });
}
