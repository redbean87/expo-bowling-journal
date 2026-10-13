// Test double for 'expo-file-system/legacy' used by the local-first
// profile reads test: file system operations never run at render time;
// touching them fails loudly.
export const cacheDirectory = null;

export const EncodingType = {
  Base64: 'base64',
  UTF8: 'utf8',
};

export function fileExistsAsync() {
  return Promise.reject(new Error('File system touched in a render test'));
}

export function writeAsStringAsync() {
  return Promise.reject(new Error('File system touched in a render test'));
}
