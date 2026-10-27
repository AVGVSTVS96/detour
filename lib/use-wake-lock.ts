"use client";

import { useEffect } from "react";

export const useWakeLock = (on: boolean) => {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;

    const acquire = async () => {
      if (lock === null && document.visibilityState === "visible") {
        lock = await navigator.wakeLock.request("screen").catch(() => null);
        lock?.addEventListener("release", () => {
          lock = null;
        });
      }
    };

    const onWake = () => {
      void acquire();
    };

    if (on && "wakeLock" in navigator) {
      onWake();
      document.addEventListener("visibilitychange", onWake);
      document.addEventListener("pointerdown", onWake);
    }

    return () => {
      document.removeEventListener("visibilitychange", onWake);
      document.removeEventListener("pointerdown", onWake);
      void lock?.release();
    };
  }, [on]);
};
