import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

const PAGES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/menu", changeFrequency: "daily", priority: 0.9 },
  { path: "/visit", changeFrequency: "weekly", priority: 0.8 },
  { path: "/events", changeFrequency: "monthly", priority: 0.7 },
  { path: "/our-story", changeFrequency: "monthly", priority: 0.6 },
  { path: "/rewards", changeFrequency: "monthly", priority: 0.5 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.5 },
  { path: "/track", changeFrequency: "monthly", priority: 0.4 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map((page) => ({ url: `${SITE_URL}${page.path}`, lastModified, changeFrequency: page.changeFrequency, priority: page.priority }));
}
