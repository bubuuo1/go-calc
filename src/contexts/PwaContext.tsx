import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import { flushTransactionOutbox, getOfflineScope } from "@/services/api";
import {
  getPendingTransactionCount,
  getTransactionsLastSyncedAt
} from "@/services/offline-storage";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaContextValue = {
  isOnline: boolean;
  isInstalled: boolean;
  canInstall: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  updateAvailable: boolean;
  installApp: () => Promise<boolean>;
  syncNow: () => Promise<void>;
  applyUpdate: () => void;
};

const PwaContext = createContext<PwaContextValue | null>(null);

const isStandalone = () => {
  if (typeof window === "undefined") return false;
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    standaloneNavigator.standalone === true
  );
};

const updateBadge = async (count: number) => {
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };

  try {
    if (count > 0 && badgeNavigator.setAppBadge) {
      await badgeNavigator.setAppBadge(count);
    } else if (count === 0 && badgeNavigator.clearAppBadge) {
      await badgeNavigator.clearAppBadge();
    }
  } catch {
    // 배지는 지원 플랫폼에서만 보조적으로 사용한다.
  }
};

export function PwaProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const refreshOfflineState = useCallback(async () => {
    const scope = await getOfflineScope();
    const [nextCount, nextLastSyncedAt] = await Promise.all([
      getPendingTransactionCount(scope),
      scope ? getTransactionsLastSyncedAt(scope) : Promise.resolve(null)
    ]);
    setPendingCount(nextCount);
    setLastSyncedAt(nextLastSyncedAt);
    await updateBadge(nextCount);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncPromiseRef.current) {
      return syncPromiseRef.current;
    }

    const sync = (async () => {
      setIsSyncing(true);
      try {
        const result = await flushTransactionOutbox();
        await refreshOfflineState();
        if (result.synced > 0 && typeof window !== "undefined") {
          window.dispatchEvent(new Event("ledger-sync-complete"));
        }
      } finally {
        setIsSyncing(false);
        syncPromiseRef.current = null;
      }
    })();

    syncPromiseRef.current = sync;
    return sync;
  }, [refreshOfflineState]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setIsInstalled(isStandalone());

    const onOnline = () => {
      setIsOnline(true);
      void syncNow();
    };
    const onOffline = () => setIsOnline(false);
    const onOutboxChange = () => void refreshOfflineState();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setIsOnline(navigator.onLine);
        void syncNow();
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("ledger-outbox-change", onOutboxChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void refreshOfflineState();
    if (navigator.onLine) {
      void syncNow();
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("ledger-outbox-change", onOutboxChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshOfflineState, syncNow]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let active = true;
    let refreshing = false;
    const onControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (!active) return;
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              active &&
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(worker);
            }
          });
        });
      })
      .catch((error) => {
        console.error("서비스 워커를 등록하지 못했습니다.", error);
      });

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  const installApp = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
      setIsInstalled(true);
      return true;
    }
    return false;
  }, [installPrompt]);

  const applyUpdate = useCallback(() => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  }, [waitingWorker]);

  const value = useMemo<PwaContextValue>(
    () => ({
      isOnline,
      isInstalled,
      canInstall: Boolean(installPrompt),
      isSyncing,
      pendingCount,
      lastSyncedAt,
      updateAvailable: Boolean(waitingWorker),
      installApp,
      syncNow,
      applyUpdate
    }),
    [
      applyUpdate,
      installApp,
      installPrompt,
      isInstalled,
      isOnline,
      isSyncing,
      lastSyncedAt,
      pendingCount,
      syncNow,
      waitingWorker
    ]
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export const usePwa = () => {
  const value = useContext(PwaContext);
  if (!value) {
    throw new Error("usePwa must be used within PwaProvider.");
  }
  return value;
};
