"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { trackAddToCart, trackPurchase } from "../lib/fbq";
import SiteHeader from "./components/site-header";
import { getBusinessStatus, formatClock } from "../lib/hours";
import { CARD_PAYMENTS_ENABLED } from "../lib/payment-config";
import { BRAND_ALIASES, SERVICE_AREAS, SITE_NAME, SITE_URL, SOCIAL_PROFILES, STORE_PHONE_TEL } from "../lib/site";

type Category = "Cheesesteaks" | "Sides" | "Drinks";

type MenuItem = {
  id: number;
  name: string;
  category: Category;
  description: string;
  price: number;
  badge?: string;
  art: string;
  image: string;
  photo?: boolean;
  imagePosition?: string;
  stock?: number | null;
  options?: MenuOption[];
};

type MenuOption = {
  id: number;
  name: string;
  priceCents: number;
};

type CartLine = {
  lineId: string;
  item: MenuItem;
  quantity: number;
  options: string[];
  optionPrice: number;
};

type ApiMenuItem = {
  id: number;
  name: string;
  category: Category;
  description: string;
  price: number;
  badge: string;
  image: string;
  imagePosition?: string;
  photo: boolean;
  stock?: number | null;
  options?: MenuOption[];
};

const categories: Array<"All" | Category> = ["All", "Cheesesteaks", "Sides", "Drinks"];

function toMenuItem(item: ApiMenuItem): MenuItem {
  const art = item.image.replace(/\/$/, "").split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "philly-otb";
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    price: item.price,
    badge: item.badge || undefined,
    art,
    image: item.image,
    photo: item.photo,
    imagePosition: item.imagePosition,
    stock: item.stock ?? null,
    options: item.options ?? [],
  };
}

const money = (value: number) => `$${value.toFixed(2)}`;

function buildFullAddress(line1: string, line2: string, city: string, state: string, zip: string) {
  const lines = [line1.trim(), line2.trim()].filter(Boolean);
  const region = [city.trim(), state.trim(), zip.trim()].filter(Boolean);
  const address = lines.join(", ");
  return region.length > 0 ? `${address}${address ? ", " : ""}${region.join(" ")}` : address;
}

// Server-rendered fallback so the menu (and its prices) is in the initial HTML
// for search engines and slow connections. The live menu from /api/menu
// replaces it as soon as it loads; ids match the database so carts still work.
const FALLBACK_MENU: MenuItem[] = [
  { id: 1, name: "Philly OTB", category: "Cheesesteaks", description: "Freshly baked bread, premium meat, grilled onions, spicy pepper, sharp white American, OTB Ranch, and OTB Tang.", price: 21.99, badge: "House favorite", art: "philly-otb", image: "/images/menu/philly-otb.jpg", photo: true, imagePosition: "50% 50%", stock: null, options: [] },
  { id: 2, name: "Classic Philly", category: "Cheesesteaks", description: "Premium meat topped with grilled onions and sharp white American.", price: 21.99, art: "classic-philly", image: "/images/menu/classic-philly.jpg", photo: true, imagePosition: "50% 56%", stock: null, options: [] },
  { id: 3, name: "Philly Melt", category: "Cheesesteaks", description: "Choice of meat, grilled onions, and sharp white American in Texas toast.", price: 15.99, art: "philly-melt", image: "/images/menu/philly-melt.jpg", photo: true, imagePosition: "50% 52%", stock: null, options: [] },
  { id: 10, name: "Fries", category: "Sides", description: "Shoestring fries topped with house seasoning.", price: 5.5, art: "philly-otb", image: "/images/menu/philly-otb.jpg", photo: true, imagePosition: "50% 78%", stock: null, options: [] },
  { id: 5, name: "OTB Fries", category: "Sides", description: "Shoestring fries, steak, grilled onions, sharp white American, OTB Ranch, and OTB Tang.", price: 20.99, badge: "Loaded", art: "otb-fries", image: "/images/menu/otb-fries.jpg", photo: true, imagePosition: "50% 52%", stock: null, options: [] },
];

// Fallback for the server render; the dashboard-managed hours replace it.
const FALLBACK_HOURS: Record<string, [number, number] | null> = {
  Monday: null,
  Tuesday: [720, 1260],
  Wednesday: [720, 1260],
  Thursday: [720, 1260],
  Friday: [720, 1260],
  Saturday: [960, 1380],
  Sunday: [960, 1380],
};

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Where can I get the best Philly cheesesteak in Burbank?",
    a: "Philly on the Block at 2600 W Victory Blvd, Burbank, CA 91505. Every cheesesteak is hand-chopped to order on freshly baked bread with premium meat, grilled onions, and sharp white American — order online for pickup or delivery.",
  },
  {
    q: "What’s on a Philly OTB cheesesteak?",
    a: "Our house favorite: freshly baked bread, premium meat, grilled onions, spicy pepper, sharp white American, and both house sauces — OTB Ranch and OTB Tang. Prefer it simple? The Classic Philly is meat, grilled onions, and sharp white American.",
  },
  {
    q: "Do you deliver cheesesteaks near me?",
    a: "Yes. We deliver around Burbank and nearby neighborhoods including Glendale, North Hollywood, Toluca Lake, Studio City, and Universal City. Order on this site, choose Delivery, and track your driver live.",
  },
  {
    q: "What are your hours?",
    a: "Tuesday–Friday 12 PM–9 PM and Saturday–Sunday 4 PM–11 PM for late-night cheesesteaks. Closed Mondays. Live hours are always shown on this page.",
  },
  {
    q: "Do you cater events?",
    a: "Yes — cheesesteak catering for birthdays, office lunches, film and studio sets, and private parties around Burbank and the San Fernando Valley. Request a date on our events page.",
  },
  {
    q: "How do I pay?",
    a: "Order online, then pay in person — cash or card — at pickup or when your delivery arrives.",
  },
];

const restaurantSchema = {
  "@context": "https://schema.org",
  "@type": ["Restaurant", "FoodEstablishment"],
  "@id": `${SITE_URL}/#restaurant`,
  name: SITE_NAME,
  alternateName: BRAND_ALIASES,
  description:
    "Hand-chopped Philly cheesesteaks, loaded OTB Fries, and cold Cokes at 2600 W Victory Blvd in Burbank, California. Pickup, delivery, and cheesesteak catering.",
  url: SITE_URL,
  logo: `${SITE_URL}/images/Philly_On_The_Block_Logo.png`,
  image: [`${SITE_URL}/og.png`, `${SITE_URL}/images/menu/classic-philly.jpg`, `${SITE_URL}/images/menu/otb-fries.jpg`],
  telephone: STORE_PHONE_TEL,
  servesCuisine: ["Cheesesteaks", "Philly Cheesesteak", "Sandwiches", "American"],
  priceRange: "$$",
  currenciesAccepted: "USD",
  paymentAccepted: "Cash, Credit Card",
  acceptsReservations: "True",
  hasMenu: `${SITE_URL}/#menu`,
  address: {
    "@type": "PostalAddress",
    streetAddress: "2600 W Victory Blvd",
    addressLocality: "Burbank",
    addressRegion: "CA",
    postalCode: "91505",
    addressCountry: "US",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 34.1841,
    longitude: -118.3396,
  },
  hasMap: "https://www.google.com/maps/search/?api=1&query=Philly+on+the+Block+2600+W+Victory+Blvd+Burbank+CA+91505",
  areaServed: SERVICE_AREAS.map((name) => ({ "@type": "City", name })),
  openingHoursSpecification: [
    { "@type": "OpeningHoursSpecification", dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday"], opens: "12:00", closes: "21:00" },
    { "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday", "Sunday"], opens: "16:00", closes: "23:00" },
  ],
  potentialAction: {
    "@type": "OrderAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/#menu`,
      actionPlatform: ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"],
    },
    deliveryMethod: ["http://purl.org/goodrelations/v1#DeliveryModePickUp", "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"],
  },
  sameAs: Object.values(SOCIAL_PROFILES),
};

const menuSchema = {
  "@context": "https://schema.org",
  "@type": "Menu",
  "@id": `${SITE_URL}/#menu`,
  name: "Philly on the Block Cheesesteak Menu",
  url: `${SITE_URL}/#menu`,
  inLanguage: "en-US",
  hasMenuSection: (["Cheesesteaks", "Sides"] as const).map((section) => ({
    "@type": "MenuSection",
    name: section,
    hasMenuItem: FALLBACK_MENU.filter((item) => item.category === section).map((item) => ({
      "@type": "MenuItem",
      name: item.name,
      description: item.description,
      image: `${SITE_URL}${item.image}`,
      offers: { "@type": "Offer", price: item.price.toFixed(2), priceCurrency: "USD" },
    })),
  })),
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

type CheckoutQuote = {
  subtotalCents: number;
  serviceFeeCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  couponDiscountCents: number;
  pointsDiscountCents: number;
  totalCents: number;
  maxRedeemablePoints: number;
};

export default function Home() {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [fulfillment, setFulfillment] = useState<"Pickup" | "Delivery">("Pickup");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, boolean>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "checkout" | "success">("cart");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">(CARD_PAYMENTS_ENABLED ? "card" : "cash");
  const [cashTotal, setCashTotal] = useState<number | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [businessStatus, setBusinessStatus] = useState({ open: false, label: "View today’s hours" });
  const [liveMenu, setLiveMenu] = useState<MenuItem[] | null>(null);
  const [liveHours, setLiveHours] = useState<Record<string, [number, number] | null> | null>(null);
  const [liveFees, setLiveFees] = useState<{ serviceFeeCents: number; taxRatePercent: number; deliveryFeeCents: number } | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponState, setCouponState] = useState<"idle" | "applying" | "applied" | "invalid">("idle");
  const [checkoutPhone, setCheckoutPhone] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [pointsBalance, setPointsBalance] = useState(0);
  const [pointsRedeem, setPointsRedeem] = useState(0);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsState, setPointsState] = useState<"idle" | "loaded" | "error">("idle");
  const pointsFetchSeqRef = useRef(0);
  const [orderNumber, setOrderNumber] = useState("");
  const [orderError, setOrderError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(false);
  const [deliveryFeeCents, setDeliveryFeeCents] = useState(0);
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  // Address the currently displayed fee was quoted for, and a sequence guard
  // so an out-of-order response never overwrites a newer quote.
  const quotedAddressRef = useRef("");
  const quoteSeqRef = useRef(0);
  const [deliveryAddress, setDeliveryAddress] = useState({ address: "", address2: "", city: "", state: "", zip: "" });
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribeState, setSubscribeState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [subscribeMessage, setSubscribeMessage] = useState("");
  const heroVisualRef = useRef<HTMLDivElement>(null);
  const crosswalkRef = useRef<HTMLImageElement>(null);
  const signRef = useRef<HTMLImageElement>(null);

  // Keep the hero street-sign pole standing on the road at any screen ratio.
  // The crosswalk artwork's road surface (horizon) is measured from the
  // rendered crosswalk element, then the sign is dropped so its pole base
  // lands just below that line. If the hero is too short to fit the pole,
  // the sign scales down instead of floating.
  useLayoutEffect(() => {
    const visual = heroVisualRef.current;
    const cross = crosswalkRef.current;
    const sign = signRef.current;
    if (!visual || !cross || !sign) return;

    // Horizon y position (px from the top of the 1800x600 crosswalk art),
    // sampled every 2.5% across its width.
    const horizon = [128,122,116,110,104,98,91,85,79,73,67,61,55,48,42,38,45,52,59,65,65,59,52,45,38,42,48,55,60,66,72,78,84,91,96,102,108,114,121,127,130];
    const crosswalkArtH = 600;
    // Pole base offset in the 904x1157 street-sign art.
    const poleBaseFrac = 1120 / 1157;
    const plant = 8;

    let scale = 1;
    const alignPole = () => {
      const vRect = visual.getBoundingClientRect();
      const cRect = cross.getBoundingClientRect();
      const sRect = sign.getBoundingClientRect();
      if (cRect.height === 0 || sRect.width === 0) return;

      const signCx = sRect.left + sRect.width / 2;
      const xFrac = Math.max(0, Math.min(1, (signCx - cRect.left) / cRect.width));
      const idx = xFrac * (horizon.length - 1);
      const i = Math.min(Math.floor(idx), horizon.length - 2);
      const yFrac = (horizon[i] + (horizon[i + 1] - horizon[i]) * (idx - i)) / crosswalkArtH;
      const horizonY = cRect.top + yFrac * cRect.height;

      const naturalW = sRect.width / scale;
      const naturalH = sRect.height / scale;
      const fitScale = Math.min(1, (horizonY - vRect.top + plant) / (poleBaseFrac * naturalH));
      scale = fitScale;
      sign.style.width = fitScale < 1 ? `${naturalW * fitScale}px` : "";
      const signTop = horizonY - vRect.top + plant - poleBaseFrac * naturalH * fitScale;
      sign.style.top = `${Math.max(signTop, 0)}px`;
    };

    alignPole();
    const align = () => alignPole();
    window.addEventListener("resize", align);
    const observer = new ResizeObserver(align);
    observer.observe(visual);
    cross.addEventListener("load", align);
    sign.addEventListener("load", align);
    return () => {
      window.removeEventListener("resize", align);
      observer.disconnect();
      cross.removeEventListener("load", align);
      sign.removeEventListener("load", align);
    };
  }, []);

  const restoreCanceledCart = useCallback(() => {
    try {
      const stored = sessionStorage.getItem("otb-cart");
      if (!stored) return;
      const lines = JSON.parse(stored) as Array<{ lineId: string; itemId: number; quantity: number; options: string[]; optionPrice: number }>;
      const restored = lines
        .map((line) => {
          const item = liveMenu?.find((candidate) => candidate.id === line.itemId);
          return item
            ? { lineId: line.lineId, item, quantity: line.quantity, options: line.options, optionPrice: line.optionPrice }
            : null;
        })
        .filter((line): line is CartLine => line !== null);
      if (restored.length === lines.length) {
        sessionStorage.removeItem("otb-cart");
        const storedFulfillment = sessionStorage.getItem("otb-fulfillment");
        if (storedFulfillment === "Delivery" || storedFulfillment === "Pickup") {
          setFulfillment(storedFulfillment);
        }
        sessionStorage.removeItem("otb-fulfillment");
        setPendingRestore(false);
        if (restored.length > 0) {
          setCart(restored);
          setCartOpen(true);
        }
      } else {
        setPendingRestore(true);
      }
    } catch {
      sessionStorage.removeItem("otb-cart");
      setPendingRestore(false);
    }
  }, [liveMenu]);

  useEffect(() => {
    let cancelled = false;

    const loadMenu = () =>
      fetch("/api/menu")
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as { menu?: ApiMenuItem[] };
        })
        .then((data) => {
          const items = data?.menu?.filter((item) => item.image) ?? null;
          if (items && items.length > 0 && !cancelled) {
            setLiveMenu(items.map(toMenuItem));
          }
        })
        .catch(() => undefined);

    const loadHours = () =>
      fetch("/api/hours")
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as {
            weeklyHours?: Record<string, [string, string]>;
            fees?: { serviceFeeCents?: number; taxRatePercent?: number; deliveryFeeCents?: number };
          };
        })
        .then((data) => {
          if (cancelled) return;
          const raw = data?.weeklyHours;
          if (raw) {
            const converted: Record<string, [number, number] | null> = {};
            for (const day of Object.keys(raw)) {
              const [open, close] = raw[day];
              if (open === "closed" || close === "closed") {
                converted[day] = null;
              } else {
                const toMinutes = (value: string) => {
                  const [h, m] = value.split(":").map(Number);
                  return h * 60 + m;
                };
                converted[day] = [toMinutes(open), toMinutes(close)];
              }
            }
            setLiveHours(converted);
          }
          if (data?.fees) {
            setLiveFees({
              serviceFeeCents: Math.round(Number(data.fees.serviceFeeCents) || 0),
              taxRatePercent: Math.round(Number(data.fees.taxRatePercent) || 0),
              deliveryFeeCents: Math.round(Number(data.fees.deliveryFeeCents) || 0),
            });
          }
        })
        .catch(() => undefined);

    loadMenu();
    loadHours();
    const refreshTimer = window.setInterval(() => {
      loadMenu();
      loadHours();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const hours = liveHours;
  const menuItemsSource = useMemo(() => liveMenu ?? FALLBACK_MENU, [liveMenu]);

  useEffect(() => {
    if (!pendingRestore) return;
    queueMicrotask(restoreCanceledCart);
  }, [pendingRestore, restoreCanceledCart]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const canceled = params.get("canceled");

    if (canceled === "1") {
      queueMicrotask(restoreCanceledCart);
      window.history.replaceState({}, "", "/");
      return;
    }

    if (params.get("cart") === "1") {
      queueMicrotask(() => setCartOpen(true));
      window.history.replaceState({}, "", "/");
      return;
    }

    if (sessionId) {
      fetch(`/api/checkout/success?session_id=${encodeURIComponent(sessionId)}`)
        .then(async (response) => {
          const body = (await response.json()) as {
            paid?: boolean;
            order?: { orderNumber: string; totalCents: number; fulfillment: string };
            error?: string;
          };
          if (!response.ok || !body.paid) {
            throw new Error(body.error ?? "Payment wasn’t completed.");
          }
          return body.order!;
        })
        .then((order) => {
          let items: Array<{ itemId: number; quantity: number }> = [];
          try {
            items = JSON.parse(sessionStorage.getItem("otb-cart") ?? "[]") as Array<{ itemId: number; quantity: number }>;
          } catch {
            // storage is optional
          }
          trackPurchase({
            value: Number((order.totalCents / 100).toFixed(2)),
            currency: "USD",
            content_type: "product",
            content_ids: items.map((item) => String(item.itemId)),
            num_items: items.reduce((sum, item) => sum + item.quantity, 0),
            order_number: order.orderNumber,
          });
          sessionStorage.removeItem("otb-cart");
          setCart([]);
          setFulfillment(order.fulfillment === "delivery" ? "Delivery" : "Pickup");
          setOrderNumber(order.orderNumber);
          setCartOpen(true);
          setCheckoutStep("success");
        })
        .catch((error: unknown) => {
          setOrderError(error instanceof Error ? error.message : "Payment wasn’t completed.");
        })
        .finally(() => {
          window.history.replaceState({}, "", "/");
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const refreshStatus = () => setBusinessStatus(getBusinessStatus(hours));
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveHours]);

  const visibleItems = useMemo(
    () => (category === "All" ? menuItemsSource : menuItemsSource.filter((item) => item.category === category)),
    [category, menuItemsSource],
  );

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce(
    (sum, line) => sum + (line.item.price + line.optionPrice) * line.quantity,
    0,
  );
  const fees = liveFees ?? { serviceFeeCents: 150, taxRatePercent: 8, deliveryFeeCents: 0 };
  const serviceFee = subtotal > 0 ? fees.serviceFeeCents / 100 : 0;
  const dynamicDeliveryFee = fulfillment === "Delivery" && subtotal > 0 ? deliveryFeeCents / 100 : 0;
  const deliveryFee =
    fulfillment === "Delivery" ? (dynamicDeliveryFee > 0 ? dynamicDeliveryFee : fees.deliveryFeeCents / 100) : 0;
  const pointsDiscountCents = Math.min(pointsRedeem, Math.max(Math.round((subtotal - couponDiscount) * 100), 0));
  const pointsDiscount = pointsDiscountCents / 100;
  const taxable = Math.max(subtotal - couponDiscount - pointsDiscount, 0);
  const tax = taxable * (fees.taxRatePercent / 100);
  const total = taxable + serviceFee + deliveryFee + tax;
  const maxRedeemablePoints = Math.min(pointsBalance, Math.max(Math.round((subtotal - couponDiscount) * 100), 0));

  // The server quote is authoritative: it runs the exact same pricing code as
  // checkout, so what's displayed here is exactly what Stripe charges. The
  // local math above only fills in before the first quote resolves.
  const displaySubtotal = quote ? quote.subtotalCents / 100 : subtotal;
  const displayCouponDiscount = quote ? quote.couponDiscountCents / 100 : couponDiscount;
  const displayPointsRedeemed = quote ? quote.pointsDiscountCents : pointsDiscountCents;
  const displayPointsDiscount = displayPointsRedeemed / 100;
  const displayDeliveryFee = quote ? quote.deliveryFeeCents / 100 : deliveryFee;
  const displayTaxService = quote ? (quote.taxCents + quote.serviceFeeCents) / 100 : serviceFee + tax;
  const displayTotal = quote ? quote.totalCents / 100 : total;
  const effectiveMaxRedeemable = quote ? quote.maxRedeemablePoints : maxRedeemablePoints;

  const soldOut = (item: MenuItem) => (item.stock ?? null) !== null && (item.stock ?? 0) <= 0;

  const cartWarnings: Record<string, "removed" | "soldout"> = {};
  if (liveMenu) {
    for (const line of cart) {
      const fresh = liveMenu.find((item) => item.id === line.item.id);
      if (!fresh) {
        cartWarnings[line.lineId] = "removed";
      } else if (soldOut(fresh)) {
        cartWarnings[line.lineId] = "soldout";
      }
    }
  }
  const cartBlocked = Object.keys(cartWarnings).length > 0;

  function openItem(item: MenuItem) {
    setSelectedOptions({});
    setSelectedItem(item);
  }

  function addToCart(item: MenuItem, options: string[] = [], optionPrice = 0) {
    trackAddToCart({
      content_ids: [String(item.id)],
      content_type: "product",
      content_name: item.name,
      value: item.price + optionPrice,
      currency: "USD",
    });
    setCart((current) => [
      ...current,
      {
        lineId: `${item.id}-${Date.now()}`,
        item,
        quantity: 1,
        options,
        optionPrice,
      },
    ]);
    setSelectedItem(null);
    setCartOpen(true);
    setCheckoutStep("cart");
  }

  function updateQuantity(lineId: string, amount: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.lineId === lineId ? { ...line, quantity: line.quantity + amount } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const addressLine1 = String(formData.get("address") ?? "").trim();
    const addressLine2 = String(formData.get("address2") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const state = String(formData.get("state") ?? "").trim();
    const zip = String(formData.get("zip") ?? "").trim();
    const address = buildFullAddress(addressLine1, addressLine2, city, state, zip);
    const notes = String(formData.get("notes") ?? "").trim();
    const destLat = "";
    const destLng = "";

    setOrderError("");
    setPlacingOrder(true);

      fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email: checkoutEmail,
          address: fulfillment === "Delivery" ? address : "",
          destLat,
          destLng,
          fulfillment: fulfillment === "Delivery" ? "delivery" : "pickup",
          paymentMethod,
          notes,
          couponCode: couponState === "applied" ? couponCode : "",
          redeemPoints: pointsRedeem,
          deliveryFeeCents,
          items: cart.map((line) => ({
            id: line.item.id,
            name: line.item.name,
            priceCents: Math.round(line.item.price * 100),
            optionPriceCents: Math.round(line.optionPrice * 100),
            quantity: line.quantity,
            options: line.options,
          })),
        }),
      })
      .then(async (response) => {
        const body = (await response.json()) as {
          mode?: "stripe" | "demo" | "cash";
          url?: string;
          order?: { orderNumber: string; totalCents?: number };
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Couldn’t place the order. Try again.");
        }
        return body;
      })
      .then((body) => {
        if (body.mode === "stripe" && body.url) {
          try {
            // Store the compact shape (itemId, not the full item object) —
            // restoreCanceledCart and the pixel Purchase event both read it.
            sessionStorage.setItem(
              "otb-cart",
              JSON.stringify(
                cart.map((line) => ({
                  lineId: line.lineId,
                  itemId: line.item.id,
                  quantity: line.quantity,
                  options: line.options,
                  optionPrice: line.optionPrice,
                })),
              ),
            );
            sessionStorage.setItem("otb-fulfillment", fulfillment);
          } catch {
            // storage is optional
          }
          window.location.href = body.url;
          return;
        }
        if (body.mode === "cash") {
          setCashTotal(typeof body.order?.totalCents === "number" ? body.order.totalCents : Math.round(total * 100));
        }
        setOrderNumber(body.order?.orderNumber ?? "");
        trackPurchase({
          value: Number(displayTotal.toFixed(2)),
          currency: "USD",
          content_type: "product",
          content_ids: cart.map((line) => String(line.item.id)),
          num_items: itemCount,
          order_number: body.order?.orderNumber ?? "",
        });
        setCheckoutStep("success");
      })
      .catch((error: unknown) => {
        setOrderError(error instanceof Error ? error.message : "Couldn’t place the order. Try again.");
        setPlacingOrder(false);
      });
  }

  function applyCoupon() {
    const code = couponCode.trim();
    if (!code || couponState === "applying") return;
    setCouponState("applying");
    setOrderError("");
    fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotalCents: Math.round(subtotal * 100) }),
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          valid?: boolean;
          discountCents?: number;
          error?: string;
        };
        if (!response.ok || !body.valid || body.discountCents === undefined) {
          throw new Error(body.error ?? "That code doesn’t apply.");
        }
        return body;
      })
      .then((body) => {
        setCouponDiscount(body.discountCents! / 100);
        setCouponState("applied");
      })
      .catch((err: unknown) => {
        setCouponDiscount(0);
        setCouponState("invalid");
        setOrderError(err instanceof Error ? err.message : "That code doesn’t apply.");
      });
  }

  function removeCoupon() {
    setCouponCode("");
    setCouponDiscount(0);
    setCouponState("idle");
    setOrderError("");
  }

  useEffect(() => {
    if (couponState === "applied" && cart.length > 0) {
      queueMicrotask(applyCoupon);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, cart.length]);

  useEffect(() => {
    const digits = checkoutPhone.replace(/\D/g, "");
    if (checkoutStep !== "checkout" || digits.length < 10) {
      const timer = window.setTimeout(() => {
        pointsFetchSeqRef.current += 1;
        setPointsLoading(false);
        setPointsBalance(0);
        setPointsState("idle");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const seq = ++pointsFetchSeqRef.current;
    const timer = window.setTimeout(() => {
      setPointsLoading(true);
      fetch(`/api/points/balance?phone=${encodeURIComponent(checkoutPhone)}`)
        .then(async (res) => {
          const body = (await res.json()) as { balance?: number; error?: string };
          if (seq !== pointsFetchSeqRef.current) return;
          if (!res.ok) throw new Error(body.error ?? "Couldn’t load points.");
          const balance = Math.max(Number(body.balance) || 0, 0);
          setPointsBalance(balance);
          setPointsRedeem((current) => Math.min(current, balance));
          setPointsState("loaded");
        })
        .catch(() => {
          if (seq !== pointsFetchSeqRef.current) return;
          setPointsState("error");
          setPointsBalance(0);
          setPointsRedeem(0);
        })
        .finally(() => {
          if (seq === pointsFetchSeqRef.current) setPointsLoading(false);
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [checkoutPhone, checkoutStep]);

  const calculateDeliveryFee = async (addressLine1: string, addressLine2: string, city: string, state: string, zip: string) => {
    if (!addressLine1 || fulfillment !== "Delivery") {
      setDeliveryFeeCents(0);
      setDeliveryDistance(null);
      quotedAddressRef.current = "";
      return;
    }

    const fullAddress = buildFullAddress(addressLine1, addressLine2, city, state, zip);
    if (!fullAddress || fullAddress === quotedAddressRef.current) return;

    const seq = ++quoteSeqRef.current;
    setFeeLoading(true);
    try {
      const res = await fetch("/api/delivery-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: fullAddress }),
      });
      if (seq !== quoteSeqRef.current) return;
      if (!res.ok) {
        // Keep the last successful quote instead of wiping the fee off the
        // page when a re-check fails (rate limits, network, bad partial
        // address). The order is re-priced server-side at checkout anyway.
        return;
      }
      const data = (await res.json()) as { feeCents?: number; miles?: number | null };
      if (seq !== quoteSeqRef.current) return;
      quotedAddressRef.current = fullAddress;
      setDeliveryFeeCents(data.feeCents ?? 0);
      setDeliveryDistance(data.miles ?? null);
    } catch {
      // Keep the last successful quote (see above).
    } finally {
      if (seq === quoteSeqRef.current) setFeeLoading(false);
    }
  };

  useEffect(() => {
    const shouldQuote = fulfillment === "Delivery" && checkoutStep === "checkout" && deliveryAddress.address;
    const timer = setTimeout(() => {
      if (shouldQuote) {
        void calculateDeliveryFee(deliveryAddress.address, deliveryAddress.address2, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zip);
      } else {
        setDeliveryFeeCents(0);
        setDeliveryDistance(null);
        quotedAddressRef.current = "";
      }
    }, shouldQuote ? 800 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryAddress, fulfillment, checkoutStep]);

  const priceQuoteSeqRef = useRef(0);
  useEffect(() => {
    if (checkoutStep === "success") return;
    const seq = ++priceQuoteSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/checkout/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: cart.map((line) => ({ id: line.item.id, quantity: line.quantity, options: line.options })),
              phone: checkoutPhone,
              fulfillment: fulfillment === "Delivery" ? "delivery" : "pickup",
              address:
                fulfillment === "Delivery"
                  ? buildFullAddress(deliveryAddress.address, deliveryAddress.address2, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zip)
                  : "",
              couponCode: couponState === "applied" ? couponCode : "",
              redeemPoints: pointsRedeem,
            }),
          });
          const body = (await response.json()) as CheckoutQuote & { error?: string };
          if (!response.ok) throw new Error(body.error ?? "Couldn’t price the order.");
          if (seq === priceQuoteSeqRef.current) setQuote(body);
        } catch {
          if (seq === priceQuoteSeqRef.current) setQuote(null);
        }
      })();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [checkoutStep, cart, checkoutPhone, fulfillment, deliveryAddress, couponCode, couponState, pointsRedeem]);

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = subscribeEmail.trim();
    if (!email || subscribeState === "submitting") return;
    setSubscribeState("submitting");
    setSubscribeMessage("");
    fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
      .then(async (response) => {
        const body = (await response.json()) as { subscribed?: boolean; error?: string };
        if (!response.ok || !body.subscribed) {
          throw new Error(body.error ?? "Couldn’t subscribe. Try again.");
        }
        setSubscribeState("done");
        setSubscribeMessage("You’re on the list. See you on the block.");
        setSubscribeEmail("");
      })
      .catch((error: unknown) => {
        setSubscribeState("error");
        setSubscribeMessage(error instanceof Error ? error.message : "Couldn’t subscribe. Try again.");
      });
  }

  function resetOrder() {    setCart([]);
    setCheckoutStep("cart");
    setCartOpen(false);
    setOrderNumber("");
    setOrderError("");
    setPaymentMethod(CARD_PAYMENTS_ENABLED ? "card" : "cash");
    setCashTotal(null);
    setQuote(null);
    removeCoupon();
    setCheckoutPhone("");
    setCheckoutEmail("");
    setPointsBalance(0);
    setPointsRedeem(0);
    setPointsState("idle");
    setDeliveryFeeCents(0);
    setDeliveryDistance(null);
    quotedAddressRef.current = "";
    quoteSeqRef.current = 0;
    setDeliveryAddress({ address: "", address2: "", city: "", state: "", zip: "" });
  }

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(menuSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <a className="skip-link" href="#menu">
        Skip to menu
      </a>

      <SiteHeader
        onCartOpen={() => setCartOpen(true)}
        itemCount={itemCount}
        businessStatus={businessStatus}
      />

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>Cheesesteaks · built for the block</span> Burbank, CA</div>
          <h1>
            <span className="sr-only">Philly Cheesesteaks in Burbank, CA — </span>
            Built on
            <span>the block.</span>
          </h1>
          <p>
            Hand-chopped cheesesteaks in Burbank — premium meat, freshly baked bread,
            grilled onions, sharp white American, and the house sauces that make it OTB.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#menu">Order on the block <b>↘</b></a>
            <a className="text-link" href="#story">Meet your new regular spot <span>→</span></a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true">
              <span>P</span><span>O</span><span>B</span>
            </div>
            <div><strong>Burbank’s cheesesteak stop</strong><small>Pickup · delivery · late weekends</small></div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Philly on the Block neighborhood illustration" ref={heroVisualRef}>
          <img className="scene-crosswalk" src="/images/otb-crosswalk.png" alt="" ref={crosswalkRef} />
          <img className="scene-truck" src="/images/otb-food-truck.png" alt="Philly on the Block cheesesteak food truck in Burbank" fetchPriority="high" />
          <img className="scene-mascot-left" src="/images/otb-mascot-left.png" alt="Philly on the Block founder holding a Burbank cheesesteak" />
          <img className="scene-mascot" src="/images/otb-mascot-right.png" alt="Philly on the Block founder holding a Burbank cheesesteak" />
          <img className="scene-sign" src="/images/otb-street-sign.png" alt="Philly on the Block street sign in Burbank, CA" ref={signRef} />
          <div className="hero-stamp" aria-hidden="true">
            <span>Chopped fresh</span>
            <strong>HOT</strong>
            <span>Every order</span>
          </div>
          <div className="hero-ticket">
            <span>Today’s move</span>
            <strong>Philly OTB</strong>
            <small>Sharp white American · OTB Ranch + Tang · $21.99</small>
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div>
          <span>Freshly baked bread</span><b>✦</b><span>OTB Ranch + Tang</span><b>✦</b>
          <span>House favorite: Philly OTB</span><b>✦</b><span>Freshly baked bread</span><b>✦</b>
          <span>OTB Ranch + Tang</span><b>✦</b><span>House favorite: Philly OTB</span>
        </div>
      </div>

      <section className="order-section" id="menu">
        <div className="section-heading">
          <div>
            <span className="kicker">The main event</span>
            <h2>Choose your damage.</h2>
          </div>
          <p>
            The Burbank cheesesteak menu and prices from Philly on the Block — order pickup or delivery. <a href={SOCIAL_PROFILES.yelp} target="_blank" rel="noopener">See our Yelp reviews ↗</a>
          </p>
        </div>

        <div className="order-toolbar">
          <div className="category-tabs" role="group" aria-label="Menu categories">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? "active" : ""}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="fulfillment-toggle" aria-label="Fulfillment method">
            {(["Pickup", "Delivery"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={fulfillment === option ? "active" : ""}
                aria-pressed={fulfillment === option}
                onClick={() => setFulfillment(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="order-layout">
          {visibleItems.length === 0 ? (
            <div className="empty-state">Nothing on the menu right now — check back soon.</div>
          ) : (
          <div className="menu-grid">
            {visibleItems.map((item, index) => (
              <article className={`menu-card${soldOut(item) ? " is-sold-out" : ""}`} key={item.id}>
                <button
                  type="button"
                  className={`menu-art ${item.art}${item.photo ? " has-photo" : ""}`}
                  onClick={() => openItem(item)}
                  aria-label={`View ${item.name}`}
                >
                  <span className="menu-number">0{index + 1}</span>
                  <img
                    className={`menu-illustration${item.photo ? " menu-photo" : ""}`}
                    src={item.image}
                    alt={item.photo ? `${item.name} from the Philly on the Block menu in Burbank, CA` : ""}
                    loading="lazy"
                    style={item.imagePosition ? { objectPosition: item.imagePosition } : undefined}
                  />
                  {item.badge && <span className="menu-badge">{item.badge}</span>}
                  {soldOut(item) && <span className="menu-soldout">Sold out</span>}
                </button>
                <div className="menu-info">
                  <div className="menu-title-row">
                    <div>
                      <span className="menu-category">{item.category}</span>
                      <h3>{item.name}</h3>
                    </div>
                    <strong>{money(item.price)}</strong>
                  </div>
                  <p>{item.description}</p>
                  <button
                    type="button"
                    className="add-button"
                    onClick={() => openItem(item)}
                    disabled={soldOut(item)}
                  >
                    {soldOut(item) ? "Sold out" : <>Add to bag <span>+</span></>}
                  </button>
                </div>
              </article>
            ))}
          </div>
          )}

          <aside className={`cart-panel ${cartOpen ? "is-open" : ""}`} aria-label="Your order">
            <button className="cart-close" type="button" onClick={() => setCartOpen(false)} aria-label="Close cart">×</button>

            {checkoutStep === "success" ? (
              <div className="order-success">
                <span className="success-check">✓</span>
                <p>Order received</p>
                <h3>You’re on the board.</h3>
                <div className="order-number"><span>Order</span><strong>{orderNumber || "#PTB-000"}</strong></div>
                <p className="success-copy">Your {fulfillment.toLowerCase()} window is approximately 20–25 minutes.</p>
                {cashTotal !== null && (
                  <p className="success-copy cash-note">Please pay {money(cashTotal / 100)} (cash or card) in person at {fulfillment === "Delivery" ? "delivery" : "pickup"}.</p>
                )}
                <button type="button" className="button button-dark" onClick={resetOrder}>Start another order</button>
              </div>
            ) : checkoutStep === "checkout" ? (
              <form className="checkout-form" onSubmit={submitOrder}>
                <button className="back-button" type="button" onClick={() => setCheckoutStep("cart")}>← Back to bag</button>
                <span className="cart-kicker">Final details</span>
                <h3>Almost yours.</h3>
                <label>
                  Name
                  <input name="name" autoComplete="name" placeholder="Your name" required />
                </label>
                <label>
                  Mobile number
                  <input
                    name="phone"
                    autoComplete="tel"
                    placeholder="(215) 555-0123"
                    required
                    value={checkoutPhone}
                    onChange={(event) => {
                      setCheckoutPhone(event.target.value);
                      if (pointsState === "error" || pointsState === "loaded") setPointsState("idle");
                    }}
                  />
                </label>
                <label>
                  Email for receipt <span className="optional-tag">(optional)</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    inputMode="email"
                    value={checkoutEmail}
                    onChange={(event) => setCheckoutEmail(event.target.value)}
                  />
                </label>
                <fieldset className="payment-method">
                  <legend>How will you pay?</legend>
                  <div className="payment-options">
                    {(CARD_PAYMENTS_ENABLED ? ([["card", "Pay by card"], ["cash", "Pay in person (cash or card)"]] as const) : ([["cash", "Pay in person (cash or card)"]] as const)).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={paymentMethod === value ? "active" : ""}
                        aria-pressed={paymentMethod === value}
                        onClick={() => setPaymentMethod(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {pointsLoading ? (
                  <div className="points-note">Checking your points…</div>
                ) : pointsState === "error" ? (
                  <div className="points-note">Couldn’t load points for this number.</div>
                ) : pointsState === "loaded" && pointsBalance > 0 ? (
                  <div className="points-redeem">
                    <div className="points-row">
                      <span>
                        You have <strong>{pointsBalance.toLocaleString("en-US")} points</strong>
                      </span>
                      <strong>≈ {money(pointsBalance / 100)}</strong>
                    </div>
                    <label>
                      Use points (100 = $1)
                      <div className="points-input-row">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={effectiveMaxRedeemable}
                          step={100}
                          value={Math.min(pointsRedeem, effectiveMaxRedeemable)}
                          placeholder="0"
                          aria-label="Points to redeem"
                          onChange={(event) =>
                            setPointsRedeem(
                              Math.min(Math.max(Math.round(Number(event.target.value) || 0), 0), effectiveMaxRedeemable),
                            )
                          }
                        />
                        {pointsRedeem > 0 && (
                          <button type="button" onClick={() => setPointsRedeem(0)}>Clear</button>
                        )}
                      </div>
                    </label>
                    <small>
                      Up to {effectiveMaxRedeemable.toLocaleString("en-US")} points ({money(effectiveMaxRedeemable / 100)}) off
                      this order.
                    </small>
                  </div>
                ) : pointsState === "loaded" ? (
                  <div className="points-note">No points yet on this number — order once and start earning.</div>
                ) : null}
                {fulfillment === "Delivery" && (
                  <fieldset className="delivery-address-fields">
                    <legend>Delivery address</legend>
                    <label>
                      Street address
                      <input name="address" autoComplete="street-address" placeholder="123 N Vine St" required value={deliveryAddress.address} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, address: e.target.value }))} />
                    </label>
                    <label>
                      Apt / Suite / Unit (optional)
                      <input name="address2" autoComplete="address-line2" placeholder="Apt 4B" value={deliveryAddress.address2} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, address2: e.target.value }))} />
                    </label>
                    <label>
                      City
                      <input name="city" autoComplete="address-level2" placeholder="Burbank" required value={deliveryAddress.city} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, city: e.target.value }))} />
                    </label>
                    <div className="address-row">
                      <label>
                        State
                        <input name="state" autoComplete="address-level1" placeholder="CA" defaultValue="CA" required value={deliveryAddress.state} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, state: e.target.value }))} />
                      </label>
                      <label>
                        ZIP code
                        <input name="zip" autoComplete="postal-code" placeholder="91505" required value={deliveryAddress.zip} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, zip: e.target.value }))} />
                      </label>
                    </div>
                    {feeLoading && <small className="fee-loading">Calculating delivery fee…</small>}
                    {deliveryDistance !== null && deliveryFeeCents > 0 && (
                      <small className="fee-result">
                        📍 {deliveryDistance} mi from truck · Delivery fee: ${((deliveryFeeCents / 100).toFixed(2))}
                      </small>
                    )}
                  </fieldset>
                )}
                <label>
                  Notes for the kitchen
                  <textarea name="notes" rows={2} maxLength={500} placeholder="No onions on the OTB, extra OTB Tang…" />
                </label>
                {couponState === "applied" && couponDiscount > 0 ? (
                  <div className="coupon-applied" role="status">
                    <span>
                      <strong>{couponCode.toUpperCase()}</strong> applied · saves {money(couponDiscount)}
                    </span>
                    <button type="button" onClick={removeCoupon}>Remove</button>
                  </div>
                ) : (
                  <div className="coupon-row">
                    <input
                      value={couponCode}
                      onChange={(event) => {
                        setCouponCode(event.target.value.toUpperCase());
                        if (couponState === "invalid") setCouponState("idle");
                      }}
                      placeholder="Coupon code"
                      aria-label="Coupon code"
                      maxLength={32}
                    />
                    <button
                      type="button"
                      className="coupon-apply"
                      disabled={couponState === "applying" || couponCode.trim() === ""}
                      onClick={applyCoupon}
                    >
                      {couponState === "applying" ? "Checking…" : "Apply"}
                    </button>
                  </div>
                )}
                <div className="cart-totals">
                  <div><span>Subtotal</span><strong>{money(displaySubtotal)}</strong></div>
                  {displayCouponDiscount > 0 && (
                    <div className="cart-discount"><span>Coupon {couponCode.toUpperCase()}</span><strong>−{money(displayCouponDiscount)}</strong></div>
                  )}
                  {displayPointsDiscount > 0 && (
                    <div className="cart-discount points-line"><span>Points (−{displayPointsRedeemed} pts)</span><strong>−{money(displayPointsDiscount)}</strong></div>
                  )}
                  {displayDeliveryFee > 0 && (
                    <div><span>Delivery fee</span><strong>{money(displayDeliveryFee)}</strong></div>
                  )}
                  <div><span>Tax + service</span><strong>{money(displayTaxService)}</strong></div>
                  <div className="grand-total"><span>Total</span><strong>{money(displayTotal)}</strong></div>
                </div>
                {orderError && <div className="demo-note" role="alert">{orderError}</div>}
                <button className="button button-primary checkout-button" type="submit" disabled={placingOrder || (fulfillment === "Delivery" && feeLoading)}>
                  {placingOrder
                    ? "Placing order…"
                    : fulfillment === "Delivery" && feeLoading
                      ? "Calculating delivery fee…"
                      : `Place order · ${money(displayTotal)}`}
                </button>
              </form>
            ) : (
              <>
                <span className="cart-kicker">Your {fulfillment}</span>
                <div className="cart-heading"><h3>The bag</h3><span>{itemCount} {itemCount === 1 ? "item" : "items"}</span></div>

                {cart.length === 0 ? (
                  <div className="empty-cart">
                    <span>+</span>
                    <h4>Your bag is hungry.</h4>
                    <p>Add a sandwich and we’ll fire up the griddle.</p>
                  </div>
                ) : (
                  <div className="cart-lines">
                    {cart.map((line) => (
                      <div className="cart-line" key={line.lineId}>
                        <div className="cart-line-top">
                          <strong>{line.item.name}</strong>
                          <span>{money((line.item.price + line.optionPrice) * line.quantity)}</span>
                        </div>
                        {line.options.length > 0 && <small>{line.options.join(" · ")}</small>}
                        <div className="quantity-control">
                          <button type="button" onClick={() => updateQuantity(line.lineId, -1)} aria-label={`Remove one ${line.item.name}`}>−</button>
                          <span>{line.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(line.lineId, 1)} aria-label={`Add one ${line.item.name}`}>+</button>
                        </div>
                        {cartWarnings[line.lineId] === "soldout" && (
                          <small className="cart-warning">Just sold out — remove it to check out.</small>
                        )}
                        {cartWarnings[line.lineId] === "removed" && (
                          <small className="cart-warning">No longer on the menu — remove it to check out.</small>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="cart-totals">
                  <div><span>Subtotal</span><strong>{money(displaySubtotal)}</strong></div>
                  {displayCouponDiscount > 0 && (
                    <div className="cart-discount"><span>Coupon {couponCode.toUpperCase()}</span><strong>−{money(displayCouponDiscount)}</strong></div>
                  )}
                  {displayPointsDiscount > 0 && (
                    <div className="cart-discount points-line"><span>Points (−{displayPointsRedeemed} pts)</span><strong>−{money(displayPointsDiscount)}</strong></div>
                  )}
                  {displayDeliveryFee > 0 && (
                    <div><span>Delivery fee</span><strong>{money(displayDeliveryFee)}</strong></div>
                  )}
                  <div><span>Tax + service</span><strong>{money(displayTaxService)}</strong></div>
                  <div className="grand-total"><span>Total</span><strong>{money(displayTotal)}</strong></div>
                </div>
                <button
                  className="button button-primary checkout-button"
                  type="button"
                  disabled={cart.length === 0 || cartBlocked}
                  onClick={() => setCheckoutStep("checkout")}
                >
                  {cartBlocked ? "Check bag for sold-out items" : "Checkout"}
                  {!cartBlocked && <span>→</span>}
                </button>
                <small className="cart-time">Ready in approximately 20–25 minutes</small>
              </>
            )}
          </aside>
        </div>
      </section>

      {cartOpen && <button className="cart-backdrop" type="button" aria-label="Close cart" onClick={() => setCartOpen(false)} />}

      <section className="story-section" id="story">
        <div className="story-label"><span>Our whole story</span><b>↓</b></div>
        <div className="story-copy">
          <p className="story-lead">No shortcuts.<br />No soft opinions.</p>
          <p className="story-body">
            Philly on the Block keeps the menu focused: Burbank cheesesteaks, seasoned fries, and cold Cokes.
            Freshly baked bread, premium meat, grilled onions, sharp white American, OTB Ranch,
            and OTB Tang do the heavy lifting. From the cheesesteak truck at 2600 W Victory Blvd,
            it’s real Philly flavor on a Burbank block.
          </p>
        </div>
        <div className="story-principles">
          <article><span>01</span><h3>The house build</h3><p>Spicy pepper, sharp white American, OTB Ranch, and OTB Tang.</p></article>
          <article><span>02</span><h3>The classic</h3><p>Premium meat, grilled onions, and sharp white American. That’s it.</p></article>
          <article><span>03</span><h3>The loaded side</h3><p>OTB Fries bring the steak, onions, cheese, and both house sauces.</p></article>
        </div>
      </section>

      <section className="faq-section" id="faq" aria-labelledby="faq-title">
        <div className="faq-intro">
          <span className="kicker">Burbank cheesesteak FAQ</span>
          <h2 id="faq-title">Good questions.</h2>
          <p>
            Looking for the best Philly cheesesteak near you? Philly on the Block serves hand-chopped
            cheesesteaks, loaded cheesesteak fries, and cold Cokes from 2600 W Victory Blvd in Burbank —
            minutes from Glendale, North Hollywood, Toluca Lake, Studio City, and Universal City.
          </p>
        </div>
        <div className="faq-list">
          {FAQS.map((faq) => (
            <details key={faq.q}>
              <summary>
                <h3>{faq.q}</h3>
                <span aria-hidden="true">+</span>
              </summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="visit-section" id="visit">
        <div className="visit-card">
          <span className="kicker">Find the block</span>
          <h2>Pull up hungry.</h2>
          <address>
            <a href="https://www.google.com/maps/dir/?api=1&destination=2600+W+Victory+Blvd%2C+Burbank%2C+CA+91505" target="_blank" rel="noreferrer">
              2600 W Victory Blvd<br />Burbank, CA 91505
            </a>
            <a className="visit-phone" href="tel:+18184066053">(818) 406-6053</a>
          </address>
          <div className="hours">
            {Object.entries(liveHours ?? FALLBACK_HOURS).map(([day, schedule]) => (
              <div key={day}><span>{day}</span><strong>{schedule ? `${formatClock(schedule[0])}–${formatClock(schedule[1])}` : "Closed"}</strong></div>
            ))}
          </div>
          <div className="visit-actions">
            <a className="button button-light" href="https://www.google.com/maps/dir/?api=1&destination=2600+W+Victory+Blvd%2C+Burbank%2C+CA+91505" target="_blank" rel="noreferrer">Get directions <span>↗</span></a>
            <a className="visit-call" href="tel:+18184066053">Call the block <span>→</span></a>
          </div>
        </div>
        <div className="map-card" aria-hidden="true">
          <img className="visit-truck" src="/images/otb-food-truck.png" alt="" loading="lazy" />
          <span className="map-road road-one">W Victory Blvd</span>
          <span className="map-road road-two">Burbank, CA</span>
          <span className="map-road road-three">91505</span>
          <span className="map-road road-four">N Buena Vista St</span>
          <div className="map-pin"><span>P/B</span></div>
          <strong>2600 W<br />Victory Blvd.</strong>
        </div>
      </section>

      <footer>
        <div className="newsletter">
          <div className="newsletter-copy">
            <h3>Get on the list.</h3>
            <p>Block drops, secret sauces, and first bites — straight to your inbox.</p>
          </div>
          <form className="newsletter-form" onSubmit={subscribe}>
            <label className="sr-only" htmlFor="newsletter-email">Email address</label>
            <input
              id="newsletter-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              maxLength={320}
              value={subscribeEmail}
              onChange={(event) => {
                setSubscribeEmail(event.target.value);
                if (subscribeState === "error" || subscribeState === "done") {
                  setSubscribeState("idle");
                  setSubscribeMessage("");
                }
              }}
            />
            <button className="button button-primary" type="submit" disabled={subscribeState === "submitting"}>
              {subscribeState === "submitting" ? "Signing up…" : "Subscribe"}
            </button>
          </form>
          {subscribeMessage && <p className="newsletter-status" role="status">{subscribeMessage}</p>}
        </div>
        <a className="brand footer-brand" href="#top">
          <img className="brand-logo" src="/images/Philly_On_The_Block_Logo.png" alt="Philly on the Block" loading="lazy" />
        </a>
        <div className="footer-social">
          <p>Fresh bread. Big flavor. Block energy.</p>
          <a className="instagram-link" href={SOCIAL_PROFILES.instagram} target="_blank" rel="noopener me" aria-label="Follow Philly on the Block on Instagram, @philly_ontheblock">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" />
            </svg>
            <span>@philly_ontheblock</span>
          </a>
        </div>
        <div className="footer-links">
          <a href="#menu">Menu</a>
          <a href="/reserve">Events</a>
          <a href="#visit">Hours</a>
          <a href="#faq">FAQ</a>
          <a href="/track">Track order</a>
          <a href="/portal">Rewards</a>
          <a href={SOCIAL_PROFILES.yelp} target="_blank" rel="noopener">Yelp</a>
          <a href="tel:+18184066053">Call</a>
        </div>
        <small>© 2026 Philly on the Block · 2600 W Victory Blvd, Burbank, CA</small>
      </footer>

      {selectedItem && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedItem(null);
          }}
        >
          <section
            className="customizer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customizer-title"
          >
            <button className="modal-close" type="button" onClick={() => setSelectedItem(null)} aria-label="Close customizer">×</button>
            <span className="cart-kicker">From the menu</span>
            <h2 id="customizer-title">{selectedItem.name}</h2>
            <p>{selectedItem.description}</p>
            <div className="menu-source-note">
              <span>Menu price</span>
              <strong>{money(selectedItem.price)}</strong>
            </div>

            {soldOut(selectedItem) && (
              <div className="soldout-note">Sold out right now — stock returns soon.</div>
            )}

            {!soldOut(selectedItem) && (selectedItem.options?.length ?? 0) > 0 && (
              <fieldset className="option-list">
                <legend>Make it yours <small>(optional)</small></legend>
                {selectedItem.options!.map((option) => {
                  const checked = selectedOptions[option.id] === true;
                  const toggle = () =>
                    setSelectedOptions((current) => ({ ...current, [option.id]: !checked }));
                  return (
                    <label key={option.id} className={`option-row${checked ? " is-checked" : ""}`}>
                      <input type="checkbox" checked={checked} onChange={toggle} />
                      <span>{option.name}</span>
                      <strong>{option.priceCents > 0 ? `+${money(option.priceCents / 100)}` : "Included"}</strong>
                    </label>
                  );
                })}
              </fieldset>
            )}

            {!soldOut(selectedItem) && (
              <button
                className="button button-primary modal-add"
                type="button"
                disabled={selectedItem.stock !== null && (selectedItem.stock ?? 0) === 0}
                onClick={() =>
                  addToCart(
                    selectedItem,
                    selectedItem.options
                      ?.filter((option) => selectedOptions[option.id])
                      .map((option) => option.name) ?? [],
                    (selectedItem.options
                      ?.filter((option) => selectedOptions[option.id])
                      .reduce((sum, option) => sum + option.priceCents, 0) ?? 0) / 100,
                  )
                }
              >
                Add to bag ·{" "}
                {money(
                  selectedItem.price +
                    ((selectedItem.options
                      ?.filter((option) => selectedOptions[option.id])
                      .reduce((sum, option) => sum + option.priceCents, 0) ?? 0) /
                      100),
                )}
              </button>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
