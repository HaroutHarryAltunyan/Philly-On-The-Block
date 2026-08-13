"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import InstallAppButton from "./components/install-app-button";
import { trackAddToCart, trackPurchase } from "../lib/fbq";

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

type HourSchedule = [number, number] | null;

function getBusinessStatus(hours: Record<string, HourSchedule> | null) {
  if (!hours) return { open: false, label: "View today’s hours" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const day = value("weekday") ?? "Monday";
  const schedule = hours[day];

  if (!schedule) return { open: false, label: "Closed today" };

  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  const [opens, closes] = schedule;
  if (minutes >= opens && minutes < closes) {
    return { open: true, label: `Open now · until ${formatClock(closes)}` };
  }

  return {
    open: false,
    label: minutes < opens ? `Opens today · ${formatClock(opens)}` : "Closed for today",
  };
}

function formatClock(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${displayHour} ${suffix}` : `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

const restaurantSchema = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: "Philly on the Block",
  description:
    "Hand-chopped cheesesteaks, loaded OTB Fries, and cold Cokes at 2600 W Victory Blvd in Burbank, California. Pickup, delivery, and event catering.",
  url: "https://philly-on-the-block.altunyanharoutyunh93.chatgpt.site",
  image: "/og.png",
  telephone: "+1-818-406-6053",
  servesCuisine: ["American", "Cheesesteaks", "Sandwiches"],
  priceRange: "$$",
  currenciesAccepted: "USD",
  paymentAccepted: "Cash, Credit Card",
  acceptsReservations: "True",
  keywords: [
    "cheesesteaks",
    "philly cheesesteak",
    "cheesesteak burbank",
    "best cheesesteaks in burbank",
    "food truck burbank",
    "burbank restaurants",
    "delivery burbank",
  ],
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
  openingHoursSpecification: [
    { "@type": "OpeningHoursSpecification", dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday"], opens: "12:00", closes: "21:00" },
    { "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday", "Sunday"], opens: "16:00", closes: "23:00" },
  ],
  sameAs: ["https://www.yelp.com/menu/philly-on-the-block-burbank"],
};

const menuSchema = {
  "@context": "https://schema.org",
  "@type": "Menu",
  name: "Philly on the Block Menu",
  url: "https://philly-on-the-block.altunyanharoutyunh93.chatgpt.site/#menu",
  hasMenuSection: [
    {
      "@type": "MenuSection",
      name: "Cheesesteaks",
      hasMenuItem: [
        { "@type": "MenuItem", name: "Philly OTB", description: "Freshly baked bread, premium meat, grilled onions, spicy pepper, sharp white American, OTB Ranch, and OTB Tang.", offers: { "@type": "Offer", price: "21.99", priceCurrency: "USD" } },
        { "@type": "MenuItem", name: "Classic Philly", description: "Premium meat topped with grilled onions and sharp white American.", offers: { "@type": "Offer", price: "21.99", priceCurrency: "USD" } },
        { "@type": "MenuItem", name: "Philly Melt", description: "Choice of meat, grilled onions, and sharp white American in Texas toast.", offers: { "@type": "Offer", price: "15.99", priceCurrency: "USD" } },
      ],
    },
    {
      "@type": "MenuSection",
      name: "Sides",
      hasMenuItem: [
        { "@type": "MenuItem", name: "Fries", description: "Shoestring fries topped with house seasoning.", offers: { "@type": "Offer", price: "5.50", priceCurrency: "USD" } },
        { "@type": "MenuItem", name: "OTB Fries", description: "Shoestring fries, steak, grilled onions, sharp white American, OTB Ranch, and OTB Tang.", offers: { "@type": "Offer", price: "20.99", priceCurrency: "USD" } },
      ],
    },
  ],
};

export default function Home() {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [fulfillment, setFulfillment] = useState<"Pickup" | "Delivery">("Pickup");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, boolean>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "checkout" | "success">("cart");
  const [businessStatus, setBusinessStatus] = useState({ open: false, label: "View today’s hours" });
  const [liveMenu, setLiveMenu] = useState<MenuItem[] | null>(null);
  const [liveHours, setLiveHours] = useState<Record<string, [number, number] | null> | null>(null);
  const [liveFees, setLiveFees] = useState<{ serviceFeeCents: number; taxRatePercent: number; deliveryFeeCents: number } | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponState, setCouponState] = useState<"idle" | "applying" | "applied" | "invalid">("idle");
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

  function restoreCanceledCart() {
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
  }

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
  const menuItemsSource = liveMenu ?? [];

  useEffect(() => {
    if (!pendingRestore) return;
    queueMicrotask(restoreCanceledCart);
  }, [pendingRestore, liveMenu, menuItemsSource]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const canceled = params.get("canceled");

    if (canceled === "1") {
      queueMicrotask(restoreCanceledCart);
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
  const taxable = Math.max(subtotal - couponDiscount, 0);
  const tax = taxable * (fees.taxRatePercent / 100);
  const total = taxable + serviceFee + deliveryFee + tax;

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
          address: fulfillment === "Delivery" ? address : "",
          destLat,
          destLng,
          fulfillment: fulfillment === "Delivery" ? "delivery" : "pickup",
          notes,
          couponCode: couponState === "applied" ? couponCode : "",
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
          mode?: "stripe" | "demo";
          url?: string;
          order?: { orderNumber: string };
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
            sessionStorage.setItem("otb-cart", JSON.stringify(cart));
            sessionStorage.setItem("otb-fulfillment", fulfillment);
          } catch {
            // storage is optional
          }
          window.location.href = body.url;
          return;
        }
        setOrderNumber(body.order?.orderNumber ?? "");
        trackPurchase({
          value: Number(total.toFixed(2)),
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
    removeCoupon();
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
      <a className="skip-link" href="#menu">
        Skip to menu
      </a>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Philly on the Block home">
          <img className="brand-logo" src="/images/otb-logo-sign.png" alt="Philly on the Block" />
        </a>

        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#menu">Menu</a>
          <a href="#story">Our story</a>
          <a href="/reserve">Events</a>
          <a href="/track">Track order</a>
          <a href="#visit">Visit</a>
        </nav>

        <div className="header-actions">
          <a className={`open-status ${businessStatus.open ? "" : "closed"}`} href="#visit">
            <i /> {businessStatus.label}
          </a>
          <button className="cart-button" type="button" onClick={() => setCartOpen(true)}>
            Bag <span>{itemCount}</span>
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>Cheesesteaks · built for the block</span> Burbank, CA</div>
          <h1>
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

        <div className="hero-visual" aria-label="Philly on the Block neighborhood illustration">
          <img className="scene-crosswalk" src="/images/otb-crosswalk.png" alt="" />
          <img className="scene-truck" src="/images/otb-food-truck.png" alt="Philly on the Block cheesesteak food truck in Burbank" />
          <img className="scene-mascot-left" src="/images/otb-mascot-left.png" alt="Philly on the Block founder holding a Burbank cheesesteak" />
          <img className="scene-mascot" src="/images/otb-mascot-right.png" alt="Philly on the Block founder holding a Burbank cheesesteak" />
          <img className="scene-sign" src="/images/otb-street-sign.png" alt="Philly on the Block street sign in Burbank, CA" />
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
            The Burbank cheesesteak menu and prices from Philly on the Block — order pickup or delivery. <a href="https://www.yelp.com/menu/philly-on-the-block-burbank" target="_blank" rel="noreferrer">View the Yelp menu ↗</a>
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
          {liveMenu === null ? (
            <div className="empty-state">Loading menu…</div>
          ) : visibleItems.length === 0 ? (
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
                  <input name="phone" autoComplete="tel" placeholder="(215) 555-0123" required />
                </label>
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
                  <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
                  {couponState === "applied" && couponDiscount > 0 && (
                    <div className="cart-discount"><span>Coupon {couponCode.toUpperCase()}</span><strong>−{money(couponDiscount)}</strong></div>
                  )}
                  {deliveryFee > 0 && (
                    <div><span>Delivery fee</span><strong>{money(deliveryFee)}</strong></div>
                  )}
                  <div><span>Tax + service</span><strong>{money(serviceFee + tax)}</strong></div>
                  <div className="grand-total"><span>Total</span><strong>{money(total)}</strong></div>
                </div>
                {orderError && <div className="demo-note" role="alert">{orderError}</div>}
                <button className="button button-primary checkout-button" type="submit" disabled={placingOrder || (fulfillment === "Delivery" && feeLoading)}>
                  {placingOrder
                    ? "Placing order…"
                    : fulfillment === "Delivery" && feeLoading
                      ? "Calculating delivery fee…"
                      : `Place order · ${money(total)}`}
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
                  <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
                  {couponState === "applied" && couponDiscount > 0 && (
                    <div className="cart-discount"><span>Coupon {couponCode.toUpperCase()}</span><strong>−{money(couponDiscount)}</strong></div>
                  )}
                  {deliveryFee > 0 && (
                    <div><span>Delivery fee</span><strong>{money(deliveryFee)}</strong></div>
                  )}
                  <div><span>Tax + service</span><strong>{money(serviceFee + tax)}</strong></div>
                  <div className="grand-total"><span>Total</span><strong>{money(total)}</strong></div>
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
            {(liveHours ? Object.entries(liveHours) : []).map(([day, schedule]) => (
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
          <img className="brand-logo" src="/images/otb-logo-sign.png" alt="Philly on the Block" />
        </a>
        <p>Fresh bread. Big flavor. Block energy.</p>
        <div className="footer-links">
          <a href="#menu">Menu</a>
          <a href="/reserve">Events</a>
          <a href="#visit">Hours</a>
          <a href="/track">Track order</a>
          <a href="tel:+18184066053">Call</a>
        </div>
        <small>© 2026 Philly on the Block · 2600 W Victory Blvd, Burbank, CA</small>
      <InstallAppButton />
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
