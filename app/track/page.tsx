"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import SiteHeader from "../components/site-header";
import LiveMap, { MapMarker } from "../components/live-map";
import { money, ORDER_STATUS_LABELS } from "../../lib/admin-client";
import { milesBetween, STORE_LOCATION, geocodeAddress } from "../../lib/tracking";

type TrackedOrder = {
  id: number;
  orderNumber: string;
  name: string;
  phone: string;
  address: string;
  fulfillment: "pickup" | "delivery";
  items: Array<{ id: number | null; name: string; priceCents: number; optionPriceCents: number; quantity: number; options: string[] }>;
  subtotalCents: number;
  serviceFeeCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  discountCents: number;
  couponCode: string;
  totalCents: number;
  status: "new" | "preparing" | "ready" | "delivering" | "completed" | "cancelled";
  paymentStatus: "unpaid" | "paid" | "refunded";
  createdAt: string;
  destLat: string;
  destLng: string;
  driverLat: string;
  driverLng: string;
  driverUpdatedAt: string | null;
};

const STEPS: Array<TrackedOrder["status"]> = ["new", "preparing", "ready", "delivering", "completed"];

// Nominatim allows ~1 request/second; back off so retries don't get
// rate-limited right back into failure.
const GEOCODE_DELAYS_MS = [0, 30_000, 120_000, 600_000, 1_800_000];

function DeliveryTrackMap({ order }: { order: TrackedOrder }) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [geocodedDest, setGeocodedDest] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocodeAttempt, setGeocodeAttempt] = useState(0);
  const geocodeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Older orders may not have destination coordinates stored. Try once to
  // geocode the address so the customer still sees where they're getting
  // delivered, instead of a map with just the store pin.
  const scheduleGeocode = useCallback((address: string, attempt: number) => {
    if (geocodeTimerRef.current !== null) return;
    if (attempt >= GEOCODE_DELAYS_MS.length) return;

    geocodeTimerRef.current = window.setTimeout(() => {
      geocodeTimerRef.current = null;
      geocodeAddress(address).then((coords) => {
        if (coords) {
          setGeocodedDest(coords);
          return;
        }
        // Bump the attempt counter so the effect below re-runs and schedules
        // the next retry with a longer backoff delay.
        setGeocodeAttempt((current) => current + 1);
      });
    }, GEOCODE_DELAYS_MS[attempt]);
  }, []);

  // Reset all geocoding state when a different order is shown.
  const [currentOrderId, setCurrentOrderId] = useState(order.id);
  if (currentOrderId !== order.id) {
    setCurrentOrderId(order.id);
    setGeocodedDest(null);
    setGeocodeAttempt(0);
  }

  useEffect(() => {
    if (geocodeTimerRef.current !== null) {
      window.clearTimeout(geocodeTimerRef.current);
      geocodeTimerRef.current = null;
    }
  }, [currentOrderId]);

  useEffect(() => {
    if (order.fulfillment !== "delivery" || !order.address) return;
    const stored = parseFloat(order.destLat);
    if (Number.isFinite(stored) && stored !== 0) return;
    if (geocodedDest) return;
    scheduleGeocode(order.address, geocodeAttempt);
  }, [order, geocodedDest, geocodeAttempt, scheduleGeocode]);

  useEffect(() => {
    return () => {
      if (geocodeTimerRef.current !== null) {
        window.clearTimeout(geocodeTimerRef.current);
        geocodeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (geocodeTimerRef.current !== null) {
        window.clearTimeout(geocodeTimerRef.current);
        geocodeTimerRef.current = null;
      }
    };
  }, []);

  const { markers, distanceText, lastUpdated, hasDriver } = useMemo(() => {
    const nextMarkers: MapMarker[] = [
      { lat: STORE_LOCATION.latitude, lng: STORE_LOCATION.longitude, kind: "store", label: STORE_LOCATION.label },
    ];
    const destLat = parseFloat(order.destLat);
    const destLng = parseFloat(order.destLng);
    const destCoords =
      Number.isFinite(destLat) && Number.isFinite(destLng)
        ? { latitude: destLat, longitude: destLng }
        : geocodedDest;
    if (destCoords) {
      nextMarkers.push({ lat: destCoords.latitude, lng: destCoords.longitude, kind: "destination", label: order.address || "Delivery address" });
    }
    const driverLat = parseFloat(order.driverLat);
    const driverLng = parseFloat(order.driverLng);
    if (Number.isFinite(driverLat) && Number.isFinite(driverLng)) {
      nextMarkers.push({ lat: driverLat, lng: driverLng, kind: "rider" });
    }
    const hasDriver = Number.isFinite(driverLat) && Number.isFinite(driverLng);
    let nextDistanceText = "";
    if (hasDriver && destCoords) {
      const dist = milesBetween(
        { latitude: driverLat, longitude: driverLng },
        { latitude: destCoords.latitude, longitude: destCoords.longitude },
      );
      nextDistanceText = dist < 1
        ? "Your driver is less than 1 mile away"
        : `Your driver is about ${Math.round(dist)} miles away`;
    }
    let nextLastUpdated = "";
    if (order.driverUpdatedAt) {
      const elapsed = Math.floor((nowTick - new Date(order.driverUpdatedAt).getTime()) / 1000);
      if (elapsed < 120) {
        nextLastUpdated = ` · Updated ${elapsed}s ago`;
      } else if (elapsed < 3600) {
        nextLastUpdated = ` · Updated ${Math.floor(elapsed / 60)}m ago`;
      }
    }

    return {
      markers: nextMarkers,
      distanceText: nextDistanceText,
      lastUpdated: nextLastUpdated,
      hasDriver,
    };
  }, [order, nowTick, geocodedDest]);

  return (
    <div style={{ marginTop: "1.5rem" }}>
      {distanceText && (
        <div style={{ fontSize: "0.85rem", color: "#3a6ea5", fontWeight: 600, marginBottom: "0.5rem" }}>
          {distanceText}{lastUpdated}
        </div>
      )}
      <LiveMap markers={markers} height="350px" />
      {!hasDriver && !order.driverUpdatedAt && (
        <div style={{ fontSize: "0.82rem", color: "#5c6b7a", marginTop: "0.5rem" }}>
          Your order is on the truck — the driver marker will appear once it heads your way.
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [recent, setRecent] = useState<TrackedOrder[]>([]);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  function stopPolling() {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function startPolling(selectedNumber: string) {
    stopPolling();
    // Poll slower than the order-status rate limit (120/10min) so live
    // tracking never 429s a customer watching their own order.
    const timer = window.setInterval(async () => {
      try {
        const params = new URLSearchParams({ phone });
        if (selectedNumber) params.set("number", selectedNumber);
        const res = await fetch(`/api/order-status?${params.toString()}`);
        const data = (await res.json()) as { order?: TrackedOrder };
        if (data.order) {
          setOrder(data.order);
        }
      } catch {
        // ignore polling errors
      }
    }, 15000);
    pollTimerRef.current = timer;
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError("");
    setOrder(null);
    setRecent([]);
    stopPolling();
    try {
      const params = new URLSearchParams({ phone });
      if (number) params.set("number", number);
      const response = await fetch(`/api/order-status?${params.toString()}`);
      const body = (await response.json()) as {
        order?: TrackedOrder;
        orders?: TrackedOrder[];
        error?: string;
      };
      if (!response.ok || (!body.order && !body.orders)) {
        throw new Error(body.error ?? "No orders found");
      }
      if (body.order) {
        setOrder(body.order);
        if (body.order.fulfillment === "delivery" && body.order.status !== "completed" && body.order.status !== "cancelled") {
          startPolling(body.order.orderNumber);
        }
      } else {
        setRecent(body.orders ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No orders found");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const stepIndex = order ? STEPS.indexOf(order.status === "cancelled" ? "cancelled" : order.status) : -1;

  const inputStyle: React.CSSProperties = {
    border: "2px solid #0b0b0d",
    borderRadius: 8,
    padding: "0.55rem 0.7rem",
    fontSize: "1rem",
    fontFamily: "inherit",
  };

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.25rem 5rem", fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)" }}>
      <span style={{ color: "#3a6ea5", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>Philly on the Block</span>
      <h1 style={{ fontSize: "2.2rem", letterSpacing: "-0.02em", margin: "0.25rem 0 0.5rem" }}>Track your order.</h1>
      <p style={{ color: "#5c6b7a", marginTop: 0 }}>
        Enter your order number and phone, or just your phone number to see your recent orders.
      </p>

      <form
        onSubmit={search}
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.75rem", margin: "1.5rem 0", alignItems: "end" }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5c6b7a" }}>
          Order number
          <input
            value={number}
            onChange={(event) => setNumber(event.target.value.toUpperCase())}
            placeholder="PTB-042 (optional)"
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5c6b7a" }}>
          Phone number
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="(818) 555-0133"
            required
            style={inputStyle}
          />
        </label>
        <button
          type="submit"
          disabled={searching}
          style={{ border: "2px solid #0b0b0d", background: "#badaff", color: "#0b0b0d", fontWeight: 800, padding: "0.6rem 1.2rem", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
        >
          {searching ? "Looking…" : "Track"}
        </button>
      </form>

      {error && <p style={{ border: "2px solid #0b0b0d", background: "#f8d7da", borderRadius: 8, padding: "0.7rem 0.9rem", fontWeight: 600 }}>{error}</p>}

      {recent.length > 0 && !order && (
        <section style={{ border: "3px solid #0b0b0d", borderRadius: 16, boxShadow: "8px 8px 0 rgba(11,11,13,0.9)", background: "#fff", padding: "1.5rem", marginTop: "1.5rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.2rem" }}>Recent orders for this number</h2>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setRecent([]); setOrder(item); if (item.fulfillment === "delivery" && item.status !== "completed" && item.status !== "cancelled") startPolling(item.orderNumber); }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "0.8rem 1rem",
                  border: "2px solid #0b0b0d",
                  borderRadius: 10,
                  background: item.status === "cancelled" ? "#f3f4f6" : "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                }}
              >
                <span>
                  <strong>{item.orderNumber}</strong>
                  <span style={{ color: "#5c6b7a", fontSize: "0.85rem", marginLeft: "0.6rem" }}>
                    {new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {" · "}{item.fulfillment === "delivery" ? "Delivery" : "Pickup"}
                  </span>
                </span>
                <span style={{ fontWeight: 800 }}>{money(item.totalCents)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {order && (
        <section style={{ border: "3px solid #0b0b0d", borderRadius: 16, boxShadow: "8px 8px 0 rgba(11,11,13,0.9)", background: "#fff", padding: "1.5rem", marginTop: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "1.4rem" }}>
              {order.orderNumber}
              <span style={{ color: "#5c6b7a", fontSize: "0.9rem", fontWeight: 600, marginLeft: "0.6rem" }}>
                {order.fulfillment === "delivery" ? "Delivery" : "Pickup"}
              </span>
            </h2>
            <span style={{ fontWeight: 800, textTransform: "uppercase", fontSize: "0.78rem", letterSpacing: "0.08em", padding: "0.25rem 0.7rem", borderRadius: 999, border: "2px solid #0b0b0d", background: "#badaff" }}>
              {order.status === "cancelled" ? "Cancelled" : ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>

          {order.status === "cancelled" ? (
            <p style={{ marginTop: "1.25rem" }}>This order was cancelled.</p>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem", margin: "1.5rem 0 0", alignItems: "center" }}>
              {STEPS.map((step, index) => {
                const reached = index <= stepIndex;
                return (
                  <div key={step} style={{ flex: 1, textAlign: "center" }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        margin: "0 auto 0.4rem",
                        borderRadius: "50%",
                        border: "2px solid #0b0b0d",
                        background: reached ? "#badaff" : "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "0.8rem",
                        fontWeight: 800,
                      }}
                    >
                      {index + 1}
                    </div>
                    <div style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {ORDER_STATUS_LABELS[step]}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {order.fulfillment === "delivery" && (
            <DeliveryTrackMap order={order} />
          )}

          <button
            type="button"
            onClick={() => { setOrder(null); setRecent([]); stopPolling(); }}
            style={{ border: "0", background: "none", color: "#3a6ea5", fontWeight: 700, cursor: "pointer", font: "inherit", fontSize: "0.85rem", marginTop: "1rem", padding: 0, textDecoration: "underline" }}
          >
            ← Track another order
          </button>

          <table style={{ width: "100%", marginTop: "1rem", borderCollapse: "collapse", fontSize: "0.92rem" }}>
            <tbody>
              {order.items.map((line, index) => (
                <tr key={index} style={{ borderTop: "1px solid #e3e9f0" }}>
                  <td style={{ padding: "0.6rem 0.25rem" }}>
                    <strong>{line.quantity}×</strong> {line.name}
                    {line.options.length > 0 && <div style={{ fontSize: "0.78rem", color: "#5c6b7a" }}>{line.options.join(", ")}</div>}
                  </td>
                  <td style={{ textAlign: "right", padding: "0.6rem 0.25rem", whiteSpace: "nowrap" }}>
                    {money((line.priceCents + line.optionPriceCents) * line.quantity)}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: "1px solid #e3e9f0" }}>
                <td style={{ padding: "0.6rem 0.25rem" }}>Subtotal</td>
                <td style={{ textAlign: "right", padding: "0.6rem 0.25rem", whiteSpace: "nowrap" }}>{money(order.subtotalCents)}</td>
              </tr>
              {order.discountCents > 0 && (
                <tr>
                  <td style={{ padding: "0.6rem 0.25rem" }}>
                    Coupon {order.couponCode || ""}
                  </td>
                  <td style={{ textAlign: "right", padding: "0.6rem 0.25rem", whiteSpace: "nowrap" }}>−{money(order.discountCents)}</td>
                </tr>
              )}
              {order.deliveryFeeCents > 0 && (
                <tr>
                  <td style={{ padding: "0.6rem 0.25rem" }}>Delivery fee</td>
                  <td style={{ textAlign: "right", padding: "0.6rem 0.25rem", whiteSpace: "nowrap" }}>{money(order.deliveryFeeCents)}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: "0.6rem 0.25rem" }}>Tax + service</td>
                <td style={{ textAlign: "right", padding: "0.6rem 0.25rem", whiteSpace: "nowrap" }}>{money(order.serviceFeeCents + order.taxCents)}</td>
              </tr>
              <tr style={{ borderTop: "1px solid #0b0b0d" }}>
                <td style={{ padding: "0.6rem 0.25rem", fontWeight: 800 }}>Total</td>
                <td style={{ textAlign: "right", padding: "0.6rem 0.25rem", fontWeight: 800, whiteSpace: "nowrap" }}>{money(order.totalCents)}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ color: "#5c6b7a", fontSize: "0.85rem", marginBottom: 0 }}>
            Order placed {new Date(order.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
            Estimated {order.fulfillment === "delivery" ? "delivery" : "pickup"} window: 20–25 minutes.
          </p>
        </section>
      )}
    </main>
    </>
  );
}