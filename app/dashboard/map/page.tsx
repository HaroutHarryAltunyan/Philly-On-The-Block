"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatTime } from "../../../lib/admin-client";
import { STORE_LOCATION, geocodeAddress, parseCoordinatePair } from "../../../lib/tracking";
import LiveMap, { MapMarker } from "../../components/live-map";

type Order = {
  id: number;
  orderNumber: string;
  name: string;
  address: string;
  fulfillment: string;
  status: string;
  driverId: number | null;
  destLat: string;
  destLng: string;
  driverLat: string;
  driverLng: string;
  driverUpdatedAt: string | null;
};

type Driver = { id: number; name: string; status: string };

// Nominatim allows ~1 request/second; back off so retries don't get
// rate-limited right back into failure.
const GEOCODE_DELAYS_MS = [0, 30_000, 120_000, 600_000, 1_800_000];
const MAX_GEOCODE_ATTEMPTS = GEOCODE_DELAYS_MS.length;

export default function DeliveryMapPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState("");
  const [geocoded, setGeocoded] = useState<Record<number, { latitude: number; longitude: number }>>({});
  const [geocodeFails, setGeocodeFails] = useState<Record<number, number>>({});
  const geocodeAttemptsRef = useRef<Map<number, number>>(new Map());
  const geocodeTimersRef = useRef<Map<number, number>>(new Map());

  const load = useCallback(() => {
    api<{ orders: Order[] }>("/api/admin/orders")
      .then((data) => setOrders(data.orders))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load orders"));
    api<{ drivers: Driver[] }>("/api/admin/drivers")
      .then((data) => setDrivers(data.drivers))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const scheduleGeocode = useCallback((orderId: number, address: string, force = false) => {
    if (geocodeTimersRef.current.has(orderId)) return;
    if (force) geocodeAttemptsRef.current.set(orderId, 0);
    const attempts = geocodeAttemptsRef.current.get(orderId) ?? 0;
    if (attempts >= MAX_GEOCODE_ATTEMPTS) return;

    const timer = window.setTimeout(() => {
      geocodeTimersRef.current.delete(orderId);
      geocodeAddress(address).then((coords) => {
        if (coords) {
          setGeocoded((prev) => ({ ...prev, [orderId]: coords }));
          return;
        }
        // Bump the failure count so the effect below re-runs and schedules
        // the next attempt with a longer backoff delay.
        setGeocodeFails((prev) => ({ ...prev, [orderId]: (prev[orderId] ?? 0) + 1 }));
        geocodeAttemptsRef.current.set(orderId, attempts + 1);
      });
    }, GEOCODE_DELAYS_MS[attempts]);
    geocodeTimersRef.current.set(orderId, timer);
  }, []);

  useEffect(() => {
    for (const order of orders) {
      if (order.fulfillment !== "delivery") continue;
      if (order.status === "completed" || order.status === "cancelled") continue;
      if (parseCoordinatePair(order.destLat, order.destLng)) continue;
      if (!order.address || geocoded[order.id]) continue;
      scheduleGeocode(order.id, order.address);
    }
  }, [orders, geocoded, geocodeFails, scheduleGeocode]);

  useEffect(() => {
    const timers = geocodeTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const deliveries = useMemo(
    () =>
      orders.filter(
        (o) => o.fulfillment === "delivery" && o.status !== "completed" && o.status !== "cancelled",
      ),
    [orders],
  );

  const nameOf = useCallback(
    (id: number | null) => (id ? drivers.find((d) => d.id === id)?.name || `Driver #${id}` : ""),
    [drivers],
  );

  const markers = useMemo(() => {
    const list: MapMarker[] = [
      { lat: STORE_LOCATION.latitude, lng: STORE_LOCATION.longitude, kind: "store", label: STORE_LOCATION.label },
    ];
    for (const order of deliveries) {
      const known = parseCoordinatePair(order.destLat, order.destLng);
      const dest = known ?? geocoded[order.id];
      if (dest) {
        list.push({
          lat: dest.latitude,
          lng: dest.longitude,
          kind: "destination",
          label: `${order.orderNumber} — ${order.name} (${order.address})`,
        });
      }
      const driverLat = parseFloat(order.driverLat);
      const driverLng = parseFloat(order.driverLng);
      if (order.driverId && Number.isFinite(driverLat) && Number.isFinite(driverLng)) {
        list.push({
          lat: driverLat,
          lng: driverLng,
          kind: "rider",
          label: `${order.orderNumber} — ${nameOf(order.driverId)}`,
        });
      }
    }
    return list;
  }, [deliveries, nameOf, geocoded]);

  return (
    <div className="admin-topbar" style={{ display: "block", maxWidth: 1100, margin: "0 auto" }}>
      <div className="admin-topbar" style={{ display: "flex" }}>
        <div>
          <span className="kicker">Live</span>
          <h1>Delivery Map</h1>
          <p>
            Truck location, drivers, and drop-offs in real time — refreshes every 10 seconds.
          </p>
        </div>
        <div className="admin-actions">
          <button className="button" type="button" onClick={load}>
            ↻ Refresh now
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="panel">
        <div className="panel-head">
          <h2>Delivery map ({deliveries.length} pending)</h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <LiveMap markers={markers} height="520px" />
        </div>
      </div>

      {deliveries.length === 0 ? (
        <div className="panel">
          <div className="panel-body empty-state">
            No pending deliveries right now — new delivery orders will appear here as they come in.
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h2>Delivery queue</h2>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Address on map</th>
                  <th>GPS updated</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((order) => {
                  const dest = parseCoordinatePair(order.destLat, order.destLng) ?? geocoded[order.id];
                  const hasGps = Number.isFinite(parseFloat(order.driverLat)) && Number.isFinite(parseFloat(order.driverLng));
                  const failedGeocodes = geocodeFails[order.id] ?? 0;
                  return (
                    <tr key={order.id}>
                      <td><strong>{order.orderNumber}</strong></td>
                      <td>{order.name}</td>
                      <td>{order.driverId ? nameOf(order.driverId) : <span style={{ color: "#8b98a5" }}>Unassigned</span>}</td>
                      <td>
                        <span className={`status-chip status-${order.status}`}>{order.status}</span>
                        {!hasGps && order.status === "delivering" && (
                          <span style={{ fontSize: "0.72rem", color: "#5c6b7a", marginLeft: "0.4rem" }}>
                            waiting for GPS…
                          </span>
                        )}
                      </td>
                      <td>
                        {dest ? (
                          <span style={{ fontSize: "0.78rem", color: "#2e7d32" }}>✓ on map</span>
                        ) : (
                          <span style={{ fontSize: "0.78rem", color: "#c62828" }}>
                            {failedGeocodes > 0 ? "geocoding failed" : "locating…"}
                            {" "}
                            <button
                              type="button"
                              onClick={() => {
                                setGeocodeFails((prev) => ({ ...prev, [order.id]: 0 }));
                                scheduleGeocode(order.id, order.address, true);
                              }}
                              style={{
                                border: "1px solid #8b98a5",
                                background: "#fff",
                                borderRadius: 6,
                                padding: "0.1rem 0.5rem",
                                fontSize: "0.72rem",
                                cursor: "pointer",
                              }}
                            >
                              Retry
                            </button>
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {order.driverUpdatedAt ? formatTime(order.driverUpdatedAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
