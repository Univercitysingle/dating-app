import { useEffect, useState } from 'react';

function isIOSFamily() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

export default function PWAExperience() {
  const [installEvent, setInstallEvent] = useState(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [updateRegistration, setUpdateRegistration] = useState(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    const onInstallPrompt = event => {
      event.preventDefault();
      if (!isStandalone()) setInstallEvent(event);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallEvent(null);
      setShowIOSHelp(false);
    };
    const onUpdate = event => {
      if (event.detail?.registration?.waiting) {
        setUpdateRegistration(event.detail.registration);
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('hart2hart:pwa-update', onUpdate);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('hart2hart:pwa-update', onUpdate);
    };
  }, []);

  const install = async () => {
    if (installEvent) {
      try {
        await installEvent.prompt();
        await installEvent.userChoice;
      } finally {
        setInstallEvent(null);
      }
      return;
    }
    if (isIOSFamily() && !isStandalone()) setShowIOSHelp(value => !value);
  };

  const update = () => {
    const waitingWorker = updateRegistration?.waiting;
    if (!waitingWorker) {
      window.location.reload();
      return;
    }

    const serviceWorkerContainer = navigator.serviceWorker;
    if (!serviceWorkerContainer?.addEventListener) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      return;
    }

    const onControllerChange = () => {
      serviceWorkerContainer.removeEventListener('controllerchange', onControllerChange);
      window.location.reload();
    };
    serviceWorkerContainer.addEventListener('controllerchange', onControllerChange);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  const canExplainIOSInstall = isIOSFamily() && !isInstalled;

  return (
    <>
      {offline && (
        <div className="pwa-status-banner pwa-offline-banner" role="status" aria-live="polite">
          <span>You are offline. Your account and live features will reconnect when your connection returns.</span>
        </div>
      )}

      {updateRegistration && (
        <div className="pwa-status-banner pwa-update-banner" role="status">
          <span>A Hart2Hart update is ready.</span>
          <button type="button" onClick={update}>Update now</button>
          <button type="button" className="pwa-banner-dismiss" onClick={() => setUpdateRegistration(null)} aria-label="Dismiss update notice">×</button>
        </div>
      )}

      {!isInstalled && (installEvent || canExplainIOSInstall) && (
        <div className="pwa-install-card" role="region" aria-label="Install Hart2Hart">
          <div className="pwa-install-copy">
            <strong>Take Hart2Hart with you</strong>
            <span>Install the app for a convenient, full-screen experience.</span>
            {showIOSHelp && (
              <span className="pwa-ios-help">
                In Safari, tap Share, then choose “Add to Home Screen”. Open Hart2Hart from the new home-screen icon.
              </span>
            )}
          </div>
          <button type="button" onClick={install}>
            {canExplainIOSInstall && !installEvent ? 'How to install' : 'Install'}
          </button>
          <button
            type="button"
            className="pwa-install-dismiss"
            onClick={() => {
              setInstallEvent(null);
              setShowIOSHelp(false);
            }}
            aria-label="Dismiss install suggestion"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
