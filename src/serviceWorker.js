const isProduction = process.env.NODE_ENV === 'production';

function announceUpdate(registration) {
  if (typeof window === 'undefined' || !registration?.waiting) return;
  window.dispatchEvent(new CustomEvent('hart2hart:pwa-update', {
    detail: { registration }
  }));
}

export function registerServiceWorker() {
  if (!isProduction || typeof window === 'undefined' ||
      !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  const register = () => navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none'
  }).then(registration => {
    announceUpdate(registration);

    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;
      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' &&
            navigator.serviceWorker.controller) {
          announceUpdate(registration);
        }
      });
    });

    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {
          // A failed update check must not interrupt the active application.
        });
      }
    };

    document.addEventListener('visibilitychange', checkForUpdate);
    checkForUpdate();
    return registration;
  }).catch(() => {
    // Service-worker support is an enhancement, not a prerequisite for using the app.
    return null;
  });

  if (document.readyState === 'complete') return register();
  return new Promise(resolve => {
    window.addEventListener('load', () => resolve(register()), { once: true });
  });
}

export function unregisterServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }
  return navigator.serviceWorker.getRegistrations().then(registrations =>
    Promise.all(registrations.map(registration => registration.unregister()))
  ).then(() => true);
}
