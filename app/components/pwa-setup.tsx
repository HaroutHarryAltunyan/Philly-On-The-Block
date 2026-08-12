"use client";

import { useEffect } from "react";
import { initInstallPrompt } from "../../lib/install-pwa";

export default function PwaSetup() {
  useEffect(() => {
    initInstallPrompt();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}