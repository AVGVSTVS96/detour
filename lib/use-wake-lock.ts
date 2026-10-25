"use client";

import { useEffect, useState } from "react";

export const useWakeLock = () => {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;

    const acquire = async () => {
      if (document.visibilityState === "visible") {
        lock = await navigator.wakeLock.request("screen").catch(() => null);
      }
    };

    const onVisible = () => {
      void acquire();
    };

    if (on && "wakeLock" in navigator) {
      onVisible();
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [on]);

  return [on, setOn] as const;
};
