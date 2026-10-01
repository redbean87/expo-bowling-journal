// Test doubles for the expo-router primitives used by the D2 navigation tests.
// They render marker elements so assertions can inspect navigation intent
// without a running router.
import { createElement } from 'react';

export function Redirect({ href }) {
  return createElement('test-redirect', { 'data-href': href });
}

function Stack(props) {
  return createElement('test-stack', null, props.children);
}

function StackScreen({ name }) {
  return createElement('test-stack-screen', { 'data-name': name });
}

Stack.Screen = StackScreen;

export { Stack };
