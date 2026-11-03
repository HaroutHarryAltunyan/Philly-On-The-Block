import type { HourSchedule } from "./hours";

// Shared shapes for the customer storefront (safe to import from client
// components; the D1 loader lives in storefront-server.ts). The database is the
// source of truth for the menu, prices, hours, and fees; the FALLBACK_* values
// only render when D1 is unreachable (and in the HTML smoke test, which runs
// the Worker without bindings) so the page is never empty.

export type MenuCategory = "Cheesesteaks" | "Sides" | "Drinks";

export type StoreMenuOption = { id: number; name: string; priceCents: number };

export type StoreMenuItem = {
  id: number;
  name: string;
  category: MenuCategory;
  description: string;
  price: number;
  badge?: string;
  image: string;
  photo: boolean;
  imagePosition?: string;
  stock: number | null;
  options: StoreMenuOption[];
};

export type StoreFees = { serviceFeeCents: number; taxRatePercent: number; deliveryFeeCents: number };

export type WeeklyHours = Record<string, HourSchedule>;

export type Storefront = {
  menu: StoreMenuItem[];
  hours: WeeklyHours;
  fees: StoreFees;
  /** False when these are the built-in fallbacks rather than live data. */
  live: boolean;
};

export const FALLBACK_MENU: StoreMenuItem[] = [
  { id: 1, name: "Philly OTB", category: "Cheesesteaks", description: "Freshly baked bread, premium meat, grilled onions, spicy pepper, sharp white American, OTB Ranch, and OTB Tang.", price: 21.99, badge: "House favorite", image: "/images/menu/philly-otb.jpg", photo: true, imagePosition: "50% 50%", stock: null, options: [] },
  { id: 2, name: "Classic Philly", category: "Cheesesteaks", description: "Premium meat topped with grilled onions and sharp white American.", price: 21.99, image: "/images/menu/classic-philly.jpg", photo: true, imagePosition: "50% 56%", stock: null, options: [] },
  { id: 3, name: "Philly Melt", category: "Cheesesteaks", description: "Choice of meat, grilled onions, and sharp white American in Texas toast.", price: 15.99, image: "/images/menu/philly-melt.jpg", photo: true, imagePosition: "50% 52%", stock: null, options: [] },
  { id: 10, name: "Fries", category: "Sides", description: "Shoestring fries topped with house seasoning.", price: 5.5, image: "/images/menu/philly-otb.jpg", photo: true, imagePosition: "50% 78%", stock: null, options: [] },
  { id: 5, name: "OTB Fries", category: "Sides", description: "Shoestring fries, steak, grilled onions, sharp white American, OTB Ranch, and OTB Tang.", price: 20.99, badge: "Loaded", image: "/images/menu/otb-fries.jpg", photo: true, imagePosition: "50% 52%", stock: null, options: [] },
];

export const FALLBACK_HOURS: WeeklyHours = {
  Monday: null,
  Tuesday: [720, 1260],
  Wednesday: [720, 1260],
  Thursday: [720, 1260],
  Friday: [720, 1260],
  Saturday: [960, 1380],
  Sunday: [960, 1380],
};

export const FALLBACK_FEES: StoreFees = { serviceFeeCents: 150, taxRatePercent: 8, deliveryFeeCents: 0 };

export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Converts the dashboard's {"Tuesday": ["12:00","21:00"] | ["closed","closed"]} to minutes. */
export function parseWeeklyHours(raw: unknown): WeeklyHours | null {
  if (!raw || typeof raw !== "object") return null;
  const toMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const out: WeeklyHours = {};
  for (const [day, pair] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [open, close] = pair.map(String);
    out[day] = open === "closed" || close === "closed" ? null : [toMinutes(open), toMinutes(close)];
  }
  return Object.keys(out).length > 0 ? out : null;
}

type MenuRow = {
  id: number;
  name: string;
  category: string;
  description: string;
  priceCents: number;
  badge: string;
  image: string;
  imagePosition: string;
  stock: number | null;
  options: StoreMenuOption[];
};

export function toStoreMenuItem(item: MenuRow): StoreMenuItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category as MenuCategory,
    description: item.description,
    price: item.priceCents / 100,
    badge: item.badge || undefined,
    image: item.image,
    imagePosition: item.imagePosition || undefined,
    photo: item.image.includes("/images/menu/") || item.image.includes("/api/menu-image/"),
    stock: item.stock === null ? null : Math.max(item.stock, 0),
    options: item.options,
  };
}
