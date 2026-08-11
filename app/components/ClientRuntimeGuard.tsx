"use client";

import { useEffect } from "react";

export default function ClientRuntimeGuard() {
  useEffect(() => {
    document.documentElement.dataset.deepcastReady = "true";

    const diagnosticMode = new URL(window.location.href).searchParams.get("interaction-check") === "1";
    if (diagnosticMode) {
      void fetch("/api/client-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "react-hydrated",
          path: window.location.pathname,
          control: "document",
        }),
        keepalive: true,
      }).catch(() => undefined);
    }

    try {
      window.sessionStorage.removeItem("deepcast-runtime-recovery");
    } catch {
      // Storage can be unavailable in strict private-browsing modes.
    }

    const current = new URL(window.location.href);
    if (current.searchParams.has("_dc_refresh") || current.searchParams.has("_dc_bfcache") || current.searchParams.has("deepcast-refresh")) {
      current.searchParams.delete("_dc_refresh");
      current.searchParams.delete("_dc_bfcache");
      current.searchParams.delete("deepcast-refresh");
      window.history.replaceState(window.history.state, "", `${current.pathname}${current.search}${current.hash}`);
    }
  }, []);

  return null;
}
