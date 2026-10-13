// Test double for 'expo-sharing' used by the local-first profile reads
// test: share operations never run at render time; touching them fails
// loudly.
export function isAvailableAsync() {
  return Promise.reject(new Error('Sharing touched in a render test'));
}

export function shareAsync() {
  return Promise.reject(new Error('Sharing touched in a render test'));
}
