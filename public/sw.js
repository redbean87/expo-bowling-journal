const BUILD_ID = '20dd7df-20260227220204';

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
