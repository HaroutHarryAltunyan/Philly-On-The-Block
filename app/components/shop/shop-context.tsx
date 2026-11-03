"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { trackAddToCart } from "../../../lib/fbq";
import { getBusinessStatus, type BusinessStatus } from "../../../lib/hours";
import {
  parseWeeklyHours,
  type Storefront,
  type StoreFees,
  type StoreMenuItem,
  type WeeklyHours,
} from "../../../lib/storefront";

export type Fulfillment = "Pickup" | "Delivery";

export type CartLine = {
  lineId: string;
  item: StoreMenuItem;
  quantity: number;
  options: string[];
  optionPrice: number;
};

type StoredLine = { lineId: string; itemId: number; quantity: number; options: string[]; optionPrice: number };

const BAG_KEY = "otb-bag-v1";
const FULFILLMENT_KEY = "otb-fulfillment";
// Readable companion to the HttpOnly session cookie (holds no secret): lets
// the header say "Account" instead of "Log in" without an API round trip.
export const ACCOUNT_HINT_COOKIE = "otb_has_account";

type ShopContextValue = {
  menu: StoreMenuItem[];
  hours: WeeklyHours;
  fees: StoreFees;
  status: BusinessStatus;
  cart: CartLine[];
  itemCount: number;
  fulfillment: Fulfillment;
  setFulfillment: (value: Fulfillment) => void;
  bagOpen: boolean;
  openBag: () => void;
  closeBag: () => void;
  selectedItem: StoreMenuItem | null;
  openItem: (item: StoreMenuItem) => void;
  closeItem: () => void;
  addToCart: (item: StoreMenuItem, options: string[], optionPrice: number, quantity: number) => void;
  updateQuantity: (lineId: string, delta: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
  isSoldOut: (item: StoreMenuItem) => boolean;
  signedIn: boolean;
  /** Last line added, for the "added" toast; cleared after it shows. */
  lastAdded: { name: string; quantity: number; key: number } | null;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function useShop(): ShopContextValue {
  const value = useContext(ShopContext);
  if (!value) throw new Error("useShop must be used inside <ShopProvider>");
  return value;
}

export const isSoldOut = (item: StoreMenuItem) => item.stock !== null && item.stock <= 0;

function readStoredBag(): { lines: StoredLine[]; fulfillment: Fulfillment | null } {
  try {
    const raw = localStorage.getItem(BAG_KEY);
    const lines = raw ? (JSON.parse(raw) as StoredLine[]) : [];
    const stored = localStorage.getItem(FULFILLMENT_KEY);
    return {
      lines: Array.isArray(lines) ? lines : [],
      fulfillment: stored === "Delivery" || stored === "Pickup" ? stored : null,
    };
  } catch {
    return { lines: [], fulfillment: null };
  }
}

export function ShopProvider({ initial, children }: { initial: Storefront; children: ReactNode }) {
  const [menu, setMenu] = useState(initial.menu);
  const [hours, setHours] = useState(initial.hours);
  const [fees, setFees] = useState(initial.fees);
  const [status, setStatus] = useState<BusinessStatus>({ open: false, label: "View today’s hours" });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [fulfillment, setFulfillmentState] = useState<Fulfillment>("Pickup");
  const [bagOpen, setBagOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StoreMenuItem | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [lastAdded, setLastAdded] = useState<ShopContextValue["lastAdded"]>(null);

  // Restore the bag saved on this device. Lines whose item left the menu are
  // dropped; prices always come from the current menu, never from storage.
  useEffect(() => {
    const { lines, fulfillment: storedFulfillment } = readStoredBag();
    const restored = lines
      .map((line) => {
        const item = initial.menu.find((candidate) => candidate.id === line.itemId);
        if (!item || !Number.isInteger(line.quantity) || line.quantity < 1) return null;
        const options = Array.isArray(line.options) ? line.options.filter((name) => item.options.some((o) => o.name === name)) : [];
        const optionPrice = item.options.filter((o) => options.includes(o.name)).reduce((sum, o) => sum + o.priceCents, 0) / 100;
        return { lineId: String(line.lineId), item, quantity: Math.min(line.quantity, 50), options, optionPrice };
      })
      .filter((line): line is CartLine => line !== null);
    const timer = window.setTimeout(() => {
      setCart(restored);
      if (storedFulfillment) setFulfillmentState(storedFulfillment);
      setSignedIn(document.cookie.split(";").some((part) => part.trim().startsWith(`${ACCOUNT_HINT_COOKIE}=1`)));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initial.menu]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const compact: StoredLine[] = cart.map((line) => ({
        lineId: line.lineId,
        itemId: line.item.id,
        quantity: line.quantity,
        options: line.options,
        optionPrice: line.optionPrice,
      }));
      localStorage.setItem(BAG_KEY, JSON.stringify(compact));
      localStorage.setItem(FULFILLMENT_KEY, fulfillment);
    } catch {
      // storage is optional (private mode, quota)
    }
  }, [cart, fulfillment, hydrated]);

  // Keep menu, stock, hours, and fees fresh while the page is open; the
  // server-rendered values are the starting point.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/menu")
        .then((response) => (response.ok ? (response.json() as Promise<{ menu?: StoreMenuItem[] }>) : null))
        .then((data) => {
          const items = data?.menu?.filter((item) => item.image);
          if (!cancelled && items && items.length > 0) {
            setMenu(items.map((item) => ({ ...item, badge: item.badge || undefined, options: item.options ?? [], stock: item.stock ?? null })));
          }
        })
        .catch(() => undefined);
      fetch("/api/hours")
        .then((response) => (response.ok ? (response.json() as Promise<{ weeklyHours?: unknown; fees?: Partial<StoreFees> }>) : null))
        .then((data) => {
          if (cancelled || !data) return;
          const parsed = parseWeeklyHours(data.weeklyHours);
          if (parsed) setHours(parsed);
          if (data.fees) {
            setFees({
              serviceFeeCents: Math.round(Number(data.fees.serviceFeeCents) || 0),
              taxRatePercent: Number(data.fees.taxRatePercent) || 0,
              deliveryFeeCents: Math.round(Number(data.fees.deliveryFeeCents) || 0),
            });
          }
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Cart lines keep pointing at the latest menu entry so sold-out and price
  // changes show up in the bag.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCart((current) =>
        current.map((line) => {
          const fresh = menu.find((item) => item.id === line.item.id);
          return fresh && fresh !== line.item ? { ...line, item: fresh } : line;
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [menu]);

  useEffect(() => {
    const refresh = () => setStatus(getBusinessStatus(hours));
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [hours]);

  const addToCart = useCallback((item: StoreMenuItem, options: string[], optionPrice: number, quantity: number) => {
    const qty = Math.min(Math.max(Math.round(quantity), 1), 50);
    trackAddToCart({
      content_ids: [String(item.id)],
      content_type: "product",
      content_name: item.name,
      value: Number(((item.price + optionPrice) * qty).toFixed(2)),
      currency: "USD",
    });
    setCart((current) => {
      const key = [...options].sort().join("|");
      const match = current.find((line) => line.item.id === item.id && [...line.options].sort().join("|") === key);
      if (match) {
        return current.map((line) => (line === match ? { ...line, quantity: Math.min(line.quantity + qty, 50) } : line));
      }
      return [...current, { lineId: `${item.id}-${Date.now()}`, item, quantity: qty, options, optionPrice }];
    });
    setLastAdded({ name: item.name, quantity: qty, key: Date.now() });
    setSelectedItem(null);
  }, []);

  const value = useMemo<ShopContextValue>(
    () => ({
      menu,
      hours,
      fees,
      status,
      cart,
      itemCount: cart.reduce((sum, line) => sum + line.quantity, 0),
      fulfillment,
      setFulfillment: setFulfillmentState,
      bagOpen,
      openBag: () => setBagOpen(true),
      closeBag: () => setBagOpen(false),
      selectedItem,
      openItem: (item) => setSelectedItem(item),
      closeItem: () => setSelectedItem(null),
      addToCart,
      updateQuantity: (lineId, delta) =>
        setCart((current) =>
          current
            .map((line) => (line.lineId === lineId ? { ...line, quantity: Math.min(line.quantity + delta, 50) } : line))
            .filter((line) => line.quantity > 0),
        ),
      removeLine: (lineId) => setCart((current) => current.filter((line) => line.lineId !== lineId)),
      clearCart: () => setCart([]),
      isSoldOut,
      signedIn,
      lastAdded,
    }),
    [menu, hours, fees, status, cart, fulfillment, bagOpen, selectedItem, addToCart, signedIn, lastAdded],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
