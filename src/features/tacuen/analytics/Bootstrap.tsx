// src/features/tacuen/analytics/Bootstrap.tsx
"use client";

import { useEffect } from "react";
import { getDeviceId, trackEvent } from "./client";

export function AnalyticsBootstrap() {
  useEffect(() => {
    const deviceId = getDeviceId();
    if (deviceId) {
      void trackEvent("session_start", {
        path: typeof window !== "undefined" ? window.location.pathname : "",
      });
    }
  }, []);

  return null;
}
