// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = {
  ...config,
  resolver: {
    ...config.resolver,
    // expo-sqlite's web implementation imports its own WebAssembly binary
    // (web/wa-sqlite/wa-sqlite.wasm). `.wasm` is neither a Metro source nor
    // asset extension by default, so that import fails to resolve. Classify
    // it as an asset so Metro emits it and the import resolves to the
    // emitted URL, fetched at runtime by the SQLite worker.
    assetExts: [...config.resolver.assetExts, 'wasm'],
  },
};
