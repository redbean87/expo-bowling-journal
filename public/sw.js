const BUILD_ID = '4d7990f-20260228001230';
const CACHE_PREFIX = 'bowling-journal';
const SHELL_CACHE_NAME = `${CACHE_PREFIX}-shell-${BUILD_ID}`;
const RUNTIME_CACHE_NAME = `${CACHE_PREFIX}-runtime-${BUILD_ID}`;

const PRE_CACHE_URLS = [
  '/',
  '/home',
  '/journal',
  '/profile',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

const BYPASS_PATH_PREFIXES = ['/api/', '/imports/', '/exports/'];

function isSameOriginRequest(requestUrl) {
  return requestUrl.origin === globalThis.location.origin;
}

function shouldBypassCaching(requestUrl) {
  return BYPASS_PATH_PREFIXES.some((prefix) =>
    requestUrl.pathname.startsWith(prefix)
  );
}

function isStaticAssetRequest(request) {
  if (request.destination === 'script' || request.destination === 'style') {
    return true;
  }

  if (
    request.destination === 'font' ||
    request.destination === 'image' ||
    request.destination === 'manifest'
  ) {
    return true;
  }

  return request.url.includes('/_expo/static/');
}

function extractAssetUrlsFromHtml(htmlText) {
  const assetUrls = new Set();
  const attributePattern = /(?:src|href)=["']([^"']+)["']/g;
  let match = attributePattern.exec(htmlText);

  while (match) {
    const rawValue = match[1] ?? '';

    if (
      rawValue.startsWith('/_expo/static/') ||
      rawValue.startsWith('/assets/')
    ) {
      assetUrls.add(rawValue);
    }

    match = attributePattern.exec(htmlText);
  }

  return [...assetUrls];
}

async function precacheBuildAssetsFromHtml() {
  const response = await fetch('/', { cache: 'no-store' });

  if (!response.ok) {
    return;
  }

  const htmlText = await response.text();
  const discoveredAssets = extractAssetUrlsFromHtml(htmlText);

  if (discoveredAssets.length === 0) {
    return;
  }

  const cache = await globalThis.caches.open(RUNTIME_CACHE_NAME);

  await Promise.all(
    discoveredAssets.map(async (assetUrl) => {
      try {
        await cache.add(assetUrl);
      } catch {
        return;
      }
    })
  );
}

async function cleanupOldCaches() {
  const cacheKeys = await globalThis.caches.keys();
  const staleKeys = cacheKeys.filter(
    (key) =>
      key.startsWith(`${CACHE_PREFIX}-`) &&
      key !== SHELL_CACHE_NAME &&
      key !== RUNTIME_CACHE_NAME
  );

  await Promise.all(staleKeys.map((key) => globalThis.caches.delete(key)));
}

async function addToCache(cacheName, request, response) {
  if (!response || !response.ok) {
    return response;
  }

  const cache = await globalThis.caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    await addToCache(SHELL_CACHE_NAME, request, response);
    return response;
  } catch {
    const cache = await globalThis.caches.open(SHELL_CACHE_NAME);
    const cached = (await cache.match(request)) ?? (await cache.match('/'));

    if (cached) {
      return cached;
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await globalThis.caches.open(RUNTIME_CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => addToCache(RUNTIME_CACHE_NAME, request, response))
    .catch(() => null);

  if (cached) {
    void networkPromise;
    return cached;
  }

  const networkResponse = await networkPromise;

  if (networkResponse) {
    return networkResponse;
  }

  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
  });
}

globalThis.addEventListener('install', (event) => {
  event.waitUntil(
    globalThis.caches
      .open(SHELL_CACHE_NAME)
      .then((cache) => cache.addAll(PRE_CACHE_URLS))
      .then(() => precacheBuildAssetsFromHtml())
      .catch(() => undefined)
  );
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(cleanupOldCaches().then(() => globalThis.clients.claim()));
});

globalThis.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  if (!isSameOriginRequest(requestUrl) || shouldBypassCaching(requestUrl)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

globalThis.addEventListener('message', (event) => {
  if (event.data?.type !== 'SKIP_WAITING') {
    return;
  }

  void globalThis.skipWaiting();
});
