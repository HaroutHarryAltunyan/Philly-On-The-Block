declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function fbq(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq(...args);
  }
}

export type FbqEventParams = Record<string, unknown>;

export function trackAddToCart(params: FbqEventParams) {
  fbq("track", "AddToCart", params);
}

export function trackPurchase(params: FbqEventParams) {
  fbq("track", "Purchase", params);
}
