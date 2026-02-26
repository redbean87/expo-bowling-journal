import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const APPLY_UPDATE_TIMEOUT_MS = 4000;

type UsePwaUpdateResult = {
  isSupported: boolean;
  isUpdateAvailable: boolean;
  isApplying: boolean;
  applyUpdate: () => void;
};

export function usePwaUpdate(): UsePwaUpdateResult {
  const [registrationFailed, setRegistrationFailed] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const isReloadingRef = useRef(false);
  const supportsServiceWorker =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator;
  const isSupported = supportsServiceWorker && !registrationFailed;

  useEffect(() => {
    if (!supportsServiceWorker) {
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;
    let updateIntervalHandle: number | null = null;

    const markUpdateReady = (worker: ServiceWorker | null) => {
      if (!worker) {
        return;
      }

      waitingWorkerRef.current = worker;
      setIsUpdateAvailable(true);
    };

    const checkForWaitingWorker = () => {
      markUpdateReady(registration?.waiting ?? null);
    };

    const handleControllerChange = () => {
      if (isReloadingRef.current) {
        return;
      }

      isReloadingRef.current = true;
      window.location.reload();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void registration?.update();
      }
    };

    const handleRegistrationUpdateFound = () => {
      const installingWorker = registration?.installing;
      if (!installingWorker) {
        return;
      }

      const handleStateChange = () => {
        if (installingWorker.state !== 'installed') {
          return;
        }

        if (!navigator.serviceWorker.controller) {
          return;
        }

        checkForWaitingWorker();
      };

      installingWorker.addEventListener('statechange', handleStateChange);
    };

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      handleControllerChange
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);

    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((nextRegistration) => {
        registration = nextRegistration;
        registration.addEventListener(
          'updatefound',
          handleRegistrationUpdateFound
        );
        checkForWaitingWorker();
        void registration.update();
        updateIntervalHandle = window.setInterval(() => {
          void registration?.update();
        }, UPDATE_CHECK_INTERVAL_MS);
      })
      .catch(() => {
        setRegistrationFailed(true);
      });

    return () => {
      if (updateIntervalHandle !== null) {
        window.clearInterval(updateIntervalHandle);
      }

      registration?.removeEventListener(
        'updatefound',
        handleRegistrationUpdateFound
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange
      );
    };
  }, [supportsServiceWorker]);

  const applyUpdate = useCallback(() => {
    const waitingWorker = waitingWorkerRef.current;
    if (!waitingWorker) {
      return;
    }

    setIsApplying(true);
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });

    window.setTimeout(() => {
      if (isReloadingRef.current) {
        return;
      }

      isReloadingRef.current = true;
      window.location.reload();
    }, APPLY_UPDATE_TIMEOUT_MS);
  }, []);

  return {
    isSupported,
    isUpdateAvailable,
    isApplying,
    applyUpdate,
  };
}
