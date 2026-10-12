// Test double for 'expo-secure-store' used by the local-first launch tests.
// Everything resolves with nothing stored.

export function getItemAsync() {
  return Promise.resolve(null);
}

export function setItemAsync() {
  return Promise.resolve();
}

export function deleteItemAsync() {
  return Promise.resolve();
}
