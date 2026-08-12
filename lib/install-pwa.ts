"use client";

type InstallPrompt = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferredPrompt: InstallPrompt | null = null;

export function initInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as unknown as InstallPrompt;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
  });
}

export function getInstallPrompt(): InstallPrompt | null {
  return deferredPrompt;
}

export function isIOS() {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}