import { useEffect, useRef } from "react";

export const useRefreshOnFocus = (refresh: () => void | Promise<void>) => {
  const refreshRef = useRef(refresh);
  const isRefreshingRef = useRef(false);
  refreshRef.current = refresh;

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible" || isRefreshingRef.current) {
        return;
      }

      isRefreshingRef.current = true;
      void Promise.resolve()
        .then(() => refreshRef.current())
        .finally(() => {
          isRefreshingRef.current = false;
        });
    };

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);
};
