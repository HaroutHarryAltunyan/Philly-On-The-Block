"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import LiveMap, { MapMarker } from "../../components/live-map";
import { money } from "../../../lib/admin-client";
import { milesBetween, STORE_LOCATION, geocodeAddress } from "../../../lib/tracking";

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
  deliveryPin?: string;
};

// Only the stages that exist for each fulfillment type.
const STEPS: Record<TrackedOrder["fulfillment"], Array<TrackedOrder["status"]>> = {
  pickup: ["new", "preparing", "ready", "completed"],
  delivery: ["new", "preparing", "ready", "delivering", "completed"],
};

const STEP_LABELS: Record<TrackedOrder["status"], string> = {
  new: "Order received",
  preparing: "Preparing",
  ready: "Ready",
  delivering: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STEP_DETAIL: Record<TrackedOrder["status"], { pickup: string; delivery: string }> = {
  new: { pickup: "We’ve got your order. It goes on the griddle next.", delivery: "We’ve got your order. It goes on the griddle next." },
  preparing: { pickup: "Your order is on the griddle.", delivery: "Your order is on the griddle." },
  ready: { pickup: "Ready for pickup at 2600 W Victory Blvd.", delivery: "Packed and waiting for your driver." },
  delivering: { pickup: "", delivery: "Your driver is on the way." },
  completed: { pickup: "Picked up. Enjoy it.", delivery: "Delivered. Enjoy it." },
  cancelled: { pickup: "This order was cancelled.", delivery: "This order was cancelled." },
};

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
    <div className="track-map">
      {distanceText && (
        <p className="track-distance" aria-live="polite">
          {distanceText}{lastUpdated}
        </p>
      )}
      <LiveMap markers={markers} height="360px" />
      {!hasDriver && !order.driverUpdatedAt && (
        <p className="field-note">Your order is on the truck — the driver marker will appear once it heads your way.</p>
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

  // Links from the order confirmation and account pages prefill the number.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("number");
    if (fromUrl) queueMicrotask(() => setNumber(fromUrl.toUpperCase().slice(0, 20)));
  }, []);

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
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const params = new URLSearchParams({ phone, number: selectedNumber });
        const res = await fetch(`/api/order-status?${params.toString()}`);
        const data = (await res.json()) as { order?: TrackedOrder };
        if (data.order) {
          setOrder(data.order);
          if (data.order.status === "completed" || data.order.status === "cancelled") stopPolling();
        }
      } catch {
        // ignore polling errors
      }
    }, 15000);
  }

  async function open(orderNumber: string) {
    const params = new URLSearchParams({ phone, number: orderNumber });
    const response = await fetch(`/api/order-status?${params.toString()}`);
    const body = (await response.json()) as { order?: TrackedOrder; error?: string };
    if (!response.ok || !body.order) throw new Error(body.error ?? "No order found");
    setOrder(body.order);
    setRecent([]);
    if (body.order.status !== "completed" && body.order.status !== "cancelled") startPolling(body.order.orderNumber);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError("");
    setOrder(null);
    setRecent([]);
    stopPolling();
    try {
      if (number.trim()) {
        await open(number.trim());
      } else {
        const response = await fetch(`/api/order-status?${new URLSearchParams({ phone }).toString()}`);
        const body = (await response.json()) as { orders?: TrackedOrder[]; error?: string };
        if (!response.ok || !body.orders) throw new Error(body.error ?? "No orders found");
        if (body.orders.length === 0) throw new Error("No orders in the last 7 days for that number.");
        setRecent(body.orders);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No orders found");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => () => stopPolling(), []);

  const steps = order ? STEPS[order.fulfillment] : [];
  const stepIndex = order ? steps.indexOf(order.status) : -1;
  const progress = steps.length > 1 && stepIndex >= 0 ? stepIndex / (steps.length - 1) : 0;
  const placed = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <section className="page-hero page-hero-blue">
        <p className="eyebrow">Order tracking</p>
        <h1 className="display-xl">Where’s my Philly?</h1>
        <p className="lede">Enter your order number and phone. Only have your phone? Leave the number blank to see recent orders.</p>
        <form className="track-form" onSubmit={search}>
          <label className="field">
            <span>Order number <em>(e.g. PTB-042)</em></span>
            <input value={number} onChange={(event) => setNumber(event.target.value.toUpperCase())} autoComplete="off" />
          </label>
          <label className="field">
            <span>Phone number</span>
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </label>
          <button className="btn btn-dark btn-lg" type="submit" disabled={searching}>{searching ? "Looking…" : "Track"}</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <section className="page-body">
        {recent.length > 0 && !order && (
          <div className="narrow">
            <h2 className="display-md">Recent orders</h2>
            <ul className="order-list">
              {recent.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="order-row order-row-button"
                    onClick={() => open(item.orderNumber).catch((err: unknown) => setError(err instanceof Error ? err.message : "No order found"))}
                  >
                    <span className="order-row-head">
                      <span>
                        <strong>{item.orderNumber}</strong>
                        <span>{placed(item.createdAt)} · {item.fulfillment === "delivery" ? "Delivery" : "Pickup"}</span>
                      </span>
                      <span className={`order-status status-${item.status}`}>{STEP_LABELS[item.status]}</span>
                    </span>
                    <span className="order-row-foot"><span>{money(item.totalCents)}</span><span aria-hidden="true">→</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {order && (
          <article className="track-card" aria-labelledby="track-title">
            <header className="track-head">
              <div>
                <p className="eyebrow">{order.fulfillment === "delivery" ? "Delivery" : "Pickup"} · placed {placed(order.createdAt)}</p>
                <h2 id="track-title" className="display-lg">{order.orderNumber}</h2>
              </div>
              <span className={`order-status status-${order.status}`}>{STEP_LABELS[order.status]}</span>
            </header>

            <p className="track-now" role="status" aria-live="polite">{STEP_DETAIL[order.status][order.fulfillment]}</p>

            {order.status !== "cancelled" && (
              <ol className="timeline" style={{ "--progress": progress } as React.CSSProperties}>
                {steps.map((step, index) => (
                  <li key={step} className={index < stepIndex ? "is-done" : index === stepIndex ? "is-current" : undefined} aria-current={index === stepIndex ? "step" : undefined}>
                    <span className="timeline-dot" aria-hidden="true">{index < stepIndex ? "✓" : index + 1}</span>
                    <span className="timeline-label">{STEP_LABELS[step]}</span>
                  </li>
                ))}
              </ol>
            )}

            {order.fulfillment === "delivery" && order.deliveryPin && !["completed", "cancelled"].includes(order.status) && (
              <div className="pin-card">
                <span>Delivery code</span>
                <strong aria-label={`Delivery code ${order.deliveryPin.split("").join(" ")}`}>{order.deliveryPin}</strong>
                <p>Give this code to your driver when your food arrives. Don’t share it before then.</p>
              </div>
            )}

            {order.fulfillment === "delivery" && order.status !== "cancelled" && <DeliveryTrackMap order={order} />}

            <dl className="bag-totals track-totals">
              {order.items.map((line, index) => (
                <div key={index}>
                  <dt>{line.quantity}× {line.name}{line.options.length > 0 && <small> · {line.options.join(", ")}</small>}</dt>
                  <dd>{money((line.priceCents + line.optionPriceCents) * line.quantity)}</dd>
                </div>
              ))}
              <div><dt>Subtotal</dt><dd>{money(order.subtotalCents)}</dd></div>
              {order.discountCents > 0 && <div className="is-discount"><dt>Coupon {order.couponCode}</dt><dd>−{money(order.discountCents)}</dd></div>}
              {order.deliveryFeeCents > 0 && <div><dt>Delivery fee</dt><dd>{money(order.deliveryFeeCents)}</dd></div>}
              <div><dt>Tax + service</dt><dd>{money(order.serviceFeeCents + order.taxCents)}</dd></div>
              <div className="is-total"><dt>Total{order.paymentStatus === "paid" ? " · paid" : " · pay in person"}</dt><dd>{money(order.totalCents)}</dd></div>
            </dl>

            <div className="stack-actions">
              <button type="button" className="btn btn-ghost-dark" onClick={() => { setOrder(null); setRecent([]); stopPolling(); }}>Track another order</button>
              <a className="btn btn-dark" href="tel:+18184066053">Call the truck</a>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
