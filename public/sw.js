const BUILD_ID = '916dafc-20260227040128';

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
