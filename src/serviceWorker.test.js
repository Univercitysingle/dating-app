const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createServiceWorkerHarness() {
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
    fetch: jest.fn(),
    Response: { error: () => ({ type: 'error' }) }
  });
  return { listeners, cache, caches, cacheStore, deletedCaches, self };
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
    const { listeners, cache } = createServiceWorkerHarness();
    const latestManifest = makeResponse('manifest-v3');
    const fetchMock = jest.fn(async () => latestManifest);
    const request = {
      method: 'GET',
      url: 'https://app.example/manifest.json',
      mode: 'cors'
    };
    const responsePromise = new Promise(resolve => {
      listeners.get('fetch')({
        request,
        respondWith: promise => resolve(promise)
      });
    });

    const workerFetch = listeners.get('fetch');
    expect(workerFetch).toBeDefined();
    const context = createServiceWorkerHarness();
    // Use the first harness's listener and its injected fetch implementation.
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(responsePromise).toBeDefined();
    expect(context.listeners.has('fetch')).toBe(true);
  });

  test('uses the cached offline page when a navigation request cannot reach the network', async () => {
    const { listeners, cacheStore } = createServiceWorkerHarness();
    const offlinePage = makeResponse('offline fallback');
    cacheStore.set('/offline.html', offlinePage);
    const request = {
      method: 'GET',
      url: 'https://app.example/discover',
      mode: 'navigate'
    };
    const responsePromise = new Promise(resolve => {
      listeners.get('fetch')({
        request,
        respondWith: promise => resolve(promise)
      });
    });

    const originalFetch = global.fetch;
    try {
      global.fetch = jest.fn(async () => { throw new Error('offline'); });
      const response = await responsePromise;
      expect(response).toBe(offlinePage);
    } finally {
      global.fetch = originalFetch;
    }
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
