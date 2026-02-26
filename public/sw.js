const BUILD_ID = 'c613d41-20260225221820';

globalThis.addEventListener('install', () => {
  void BUILD_ID;
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(globalThis.clients.claim());
});

globalThis.addEventListener('message', (event) => {
  if (event.data?.type !== 'SKIP_WAITING') {
    return;
  }

  void globalThis.skipWaiting();
});
