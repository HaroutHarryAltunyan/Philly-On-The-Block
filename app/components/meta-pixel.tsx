"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { fbq } from "../../lib/fbq";

export default function MetaPixel({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!pixelId || typeof window === "undefined" || typeof window.fbq !== "function") return;
    const url = `${pathname}${searchParams ? `?${searchParams}` : ""}`;
    if (lastUrl.current === null) {
      // The base snippet in <head> already fired PageView for the landing
      // page, so only start tracking after the first client-side navigation.
      lastUrl.current = url;
      return;
    }
    if (lastUrl.current === url) return;
    lastUrl.current = url;
    fbq("track", "PageView", { page_path: url });
  }, [pathname, searchParams, pixelId]);

  return null;
}
