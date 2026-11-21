const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createServiceWorkerHarness(fetchImpl = jest.fn()) {
  const listeners = new Map();
  const cacheStore = new Map();
  const deletedCaches = [];
  const cache = {
    addAll: jest.fn(async urls => {
      urls.forEach(url => cacheStore.set(url, { url }));
    }),
    match: jest.fn(async request => {
      const key = typeof request === 'string' ? request : request.url;
      return cacheStore.get(key);
    }),
    put: jest.fn(async (request, response) => {
      const key = typeof request === 'string' ? request : request.url;
      cacheStore.set(key, response);
    })
  };
  const caches = {
    open: jest.fn(async () => cache),
    keys: jest.fn(async () => [
      'hart2hart-pwa-v1',
      'hart2hart-pwa-v2',
      'unrelated-cache'
    ]),
    delete: jest.fn(async key => {
      deletedCaches.push(key);
      return true;
    })
  };
  const self = {
    location: new URL('https://app.example/sw.js'),
    registration: { showNotification: jest.fn(async () => {}) },
    clients: {
      claim: jest.fn(async () => {}),
      matchAll: jest.fn(async () => []),
      openWindow: jest.fn(async () => {})
    },
    skipWaiting: jest.fn(async () => {}),
    addEventListener: (name, callback) => listeners.set(name, callback)
  };
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'sw.js'),
    'utf8'
  );
  vm.runInNewContext(source, {
    self,
    caches,
    URL,
    fetch: fetchImpl,
    Response: { error: () => ({ type: 'error' }) }
  });
  return { listeners, cache, caches, cacheStore, deletedCaches, self, fetchMock: fetchImpl };
}

function makeResponse(body) {
  return {
    body,
    ok: true,
    type: 'basic',
    clone: jest.fn(function clone() { return this; })
  };
}

describe('service worker cache and offline security policy', () => {
  test('does not intercept authenticated API requests', () => {
    const { listeners } = createServiceWorkerHarness();
    const respondWith = jest.fn();

    listeners.get('fetch')({
      request: {
        method: 'GET',
        url: 'https://app.example/api/users/me',
        mode: 'cors'
      },
      respondWith
    });

    expect(respondWith).not.toHaveBeenCalled();
  });

  test('does not intercept non-GET requests or cross-origin resources', () => {
    const { listeners } = createServiceWorkerHarness();
    const respondWith = jest.fn();

    listeners.get('fetch')({
      request: { method: 'POST', url: 'https://app.example/api/chat/send', mode: 'cors' },
      respondWith
    });
    listeners.get('fetch')({
      request: { method: 'GET', url: 'https://cdn.example/image.webp', mode: 'cors' },
      respondWith
    });

    expect(respondWith).not.toHaveBeenCalled();
  });

  test('revalidates the manifest from the network and stores the latest response', async () => {
    const latestManifest = makeResponse('manifest-v3');
    const fetchMock = jest.fn(async () => latestManifest);
    const { listeners, cache } = createServiceWorkerHarness(fetchMock);
    const request = {
      method: 'GET',
      url: 'https://app.example/manifest.json',
      mode: 'cors'
    };
    let responsePromise;
    listeners.get('fetch')({
      request,
      respondWith: promise => { responsePromise = promise; }
    });

    const response = await responsePromise;

    expect(response).toBe(latestManifest);
    expect(fetchMock).toHaveBeenCalledWith(request);
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).toHaveBeenCalledWith(request, latestManifest);
  });

  test('uses the cached manifest if network revalidation fails', async () => {
    const cachedManifest = makeResponse('cached-manifest');
    const fetchMock = jest.fn(async () => { throw new Error('offline'); });
    const { listeners, cacheStore } = createServiceWorkerHarness(fetchMock);
    cacheStore.set('https://app.example/manifest.json', cachedManifest);
    const request = {
      method: 'GET',
      url: 'https://app.example/manifest.json',
      mode: 'cors'
    };
    let responsePromise;
    listeners.get('fetch')({
      request,
      respondWith: promise => { responsePromise = promise; }
    });

    await expect(responsePromise).resolves.toBe(cachedManifest);
  });

  test('uses the cached offline page when a navigation request cannot reach the network', async () => {
    const fetchMock = jest.fn(async () => { throw new Error('offline'); });
    const { listeners, cacheStore } = createServiceWorkerHarness(fetchMock);
    const offlinePage = makeResponse('offline fallback');
    cacheStore.set('/offline.html', offlinePage);
    const request = {
      method: 'GET',
      url: 'https://app.example/discover',
      mode: 'navigate'
    };
    let responsePromise;
    listeners.get('fetch')({
      request,
      respondWith: promise => { responsePromise = promise; }
    });

    await expect(responsePromise).resolves.toBe(offlinePage);
  });

  test('activation deletes only older Hart2Hart caches', async () => {
    const { listeners, caches, deletedCaches, self } = createServiceWorkerHarness();
    let activation;
    listeners.get('activate')({ waitUntil: promise => { activation = promise; } });

    await activation;

    expect(deletedCaches).toEqual(['hart2hart-pwa-v1', 'hart2hart-pwa-v2']);
    expect(caches.delete).toHaveBeenCalledTimes(2);
    expect(self.clients.claim).toHaveBeenCalledTimes(1);
  });
});
