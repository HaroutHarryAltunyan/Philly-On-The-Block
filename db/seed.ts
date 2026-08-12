import type { menuItems } from "./schema";

export const seedMenuItems: Array<Omit<typeof menuItems.$inferInsert, "createdAt">> = [
  {
    name: "Philly OTB",
    category: "Cheesesteaks",
    description:
      "Freshly baked bread, premium meat, grilled onions, spicy pepper, sharp white American, OTB Ranch, and OTB Tang.",
    priceCents: 2199,
    badge: "House favorite",
    image: "/images/menu/philly-otb.jpg",
    imagePosition: "50% 15%",
    sortOrder: 1,
  },
  {
    name: "Classic Philly",
    category: "Cheesesteaks",
    description: "Premium meat topped with grilled onions and sharp white American.",
    priceCents: 2199,
    badge: "",
    image: "/images/menu/classic-philly.jpg",
    imagePosition: "50% 56%",
    sortOrder: 2,
  },
  {
    name: "Philly Melt",
    category: "Cheesesteaks",
    description: "Choice of meat, grilled onions, and sharp white American in Texas toast.",
    priceCents: 1599,
    badge: "",
    image: "/images/menu/philly-melt.jpg",
    imagePosition: "50% 52%",
    sortOrder: 3,
  },
  {
    name: "Fries",
    category: "Sides",
    description: "Shoestring fries topped with house seasoning.",
    priceCents: 550,
    badge: "",
    image: "/images/menu/philly-otb.jpg",
    imagePosition: "50% 78%",
    sortOrder: 4,
  },
  {
    name: "OTB Fries",
    category: "Sides",
    description: "Shoestring fries, steak, grilled onions, sharp white American, OTB Ranch, and OTB Tang.",
    priceCents: 2099,
    badge: "Loaded",
    image: "/images/menu/otb-fries.jpg",
    imagePosition: "50% 52%",
    sortOrder: 5,
  },
];

export const DEFAULT_PASSCODE = "philly123";
