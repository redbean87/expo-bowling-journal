// Test double for 'expo-document-picker' used by the local-first profile
// reads test: the document picker must not open at render time.
export async function getDocumentAsync(_options) {
  throw new Error('Document picker opened in a render test');
}
