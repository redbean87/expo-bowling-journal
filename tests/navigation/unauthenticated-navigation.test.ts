import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';

import React from 'react';

import { setTestAuthState } from './stubs/convex-react.mjs';
import { syncerMounts } from './stubs/game-save-queue-syncer.mjs';

// `react-dom/server` ships no type declarations under this package's module
// resolution, so it is loaded through a CJS require and typed explicitly.
const require = createRequire(__filename);
const {
  renderToString,
}: { renderToString: (node: unknown) => string } = require('react-dom/server');

// The route components use JSX, which the tsx runner compiles to the classic
// `React.createElement` runtime (the Expo `jsx: "react-native"` tsc mode has
// no esbuild equivalent). Expose the same React instance on the global scope
// so the compiled route modules can resolve `React` from scope.
Object.assign(globalThis, { React });

// These tests render the REAL route components (`app/index.tsx` and
// `app/(app)/_layout.tsx`) under the plain Node/tsx runner. Their environment
// (convex auth state, expo-router primitives, theme, and the queue syncer)
// cannot load unmodified, so each specifier is remapped to a local test
// double. The remap is registered on this thread via `registerHooks` (the
// async `module.register` API does not intercept under the tsx runner), the
// same mechanism the DB tests use for `expo-sqlite`, and is deregistered once
// this file's tests complete.
const stubDir = path.join(__dirname, 'stubs');
const stubUrls: Record<string, string> = {
  'convex/react': pathToFileURL(path.join(stubDir, 'convex-react.mjs')).href,
  'expo-router': pathToFileURL(path.join(stubDir, 'expo-router.mjs')).href,
  '@/theme/use-app-theme': pathToFileURL(path.join(stubDir, 'app-theme.mjs'))
    .href,
  '@/providers/game-save-queue-syncer': pathToFileURL(
    path.join(stubDir, 'game-save-queue-syncer.mjs')
  ).href,
};

const hookHandle = registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = stubUrls[specifier];

    if (url) {
      return { url, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});

after(() => {
  hookHandle.deregister();
});

type IndexModule = typeof import('../../app/index');
type AppLayoutModule = typeof import('../../app/(app)/_layout');

type RouteModules = {
  IndexScreen: IndexModule['default'];
  AppLayout: AppLayoutModule['default'];
};

// Dynamic import is required so the stub remaps (registered above) are in
// effect when the route components resolve their imports.
async function loadRouteModules(): Promise<RouteModules> {
  const [indexModule, appLayoutModule] = await Promise.all([
    import('../../app/index'),
    import('../../app/(app)/_layout'),
  ]);

  return {
    IndexScreen: indexModule.default,
    AppLayout: appLayoutModule.default,
  };
}

let routeModulesPromise: Promise<RouteModules> | null = null;

function getRouteModules() {
  routeModulesPromise ??= loadRouteModules();

  return routeModulesPromise;
}

type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
};

function renderIndex(IndexScreen: React.ComponentType, state: AuthState) {
  setTestAuthState(state);

  return renderToString(React.createElement(IndexScreen));
}

function renderAppLayout(AppLayout: React.ComponentType, state: AuthState) {
  setTestAuthState(state);
  syncerMounts.length = 0;

  return renderToString(React.createElement(AppLayout));
}

function countRedirects(html: string) {
  return html.split('<test-redirect').length - 1;
}

test('unauthenticated startup does not redirect to sign-in', async () => {
  const { IndexScreen } = await getRouteModules();
  const html = renderIndex(IndexScreen, {
    isLoading: false,
    isAuthenticated: false,
  });

  assert.ok(!html.includes('/sign-in'));
});

test('unauthenticated startup proceeds to the normal home route', async () => {
  const { IndexScreen } = await getRouteModules();
  const html = renderIndex(IndexScreen, {
    isLoading: false,
    isAuthenticated: false,
  });

  assert.ok(html.includes('<test-redirect'));
  assert.ok(html.includes('data-href="/home"'));
});

test('authenticated startup preserves the existing redirect to home', async () => {
  const { IndexScreen } = await getRouteModules();
  const html = renderIndex(IndexScreen, {
    isLoading: false,
    isAuthenticated: true,
  });

  assert.equal(countRedirects(html), 1);
  assert.ok(html.includes('data-href="/home"'));
  assert.ok(!html.includes('/sign-in'));
});

test('startup renders nothing while auth is still loading', async () => {
  const { IndexScreen } = await getRouteModules();

  assert.equal(
    renderIndex(IndexScreen, { isLoading: true, isAuthenticated: false }),
    ''
  );
});

test('unauthenticated users can enter the app shell', async () => {
  const { AppLayout } = await getRouteModules();
  const html = renderAppLayout(AppLayout, {
    isLoading: false,
    isAuthenticated: false,
  });

  assert.ok(!html.includes('/sign-in'));
  assert.ok(html.includes('<test-stack'));
  assert.ok(html.includes('<test-stack-screen'));
  assert.ok(html.includes('data-name="(tabs)"'));
});

test('authenticated users still get cloud queue sync behavior', async () => {
  const { AppLayout } = await getRouteModules();
  const html = renderAppLayout(AppLayout, {
    isLoading: false,
    isAuthenticated: true,
  });

  assert.ok(html.includes('<test-stack'));
  assert.equal(syncerMounts.length, 1);
});

test('unauthenticated users do not mount or start the authenticated queue syncer', async () => {
  const { AppLayout } = await getRouteModules();
  renderAppLayout(AppLayout, {
    isLoading: false,
    isAuthenticated: false,
  });

  assert.equal(syncerMounts.length, 0);
});

test('app shell renders nothing while auth is still loading', async () => {
  const { AppLayout } = await getRouteModules();
  const html = renderAppLayout(AppLayout, {
    isLoading: true,
    isAuthenticated: true,
  });

  assert.equal(html, '');
  assert.equal(syncerMounts.length, 0);
});
