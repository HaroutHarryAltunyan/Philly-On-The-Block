import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // Googlebot renders the page with JavaScript; it must be able to fetch
      // the public menu, hours, and menu photos or it sees an empty menu.
      allow: ["/", "/api/menu", "/api/hours", "/api/menu-image/"],
      disallow: ["/api/", "/dashboard", "/portal"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
