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

export default function DeliveryMapPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState("");
  const [geocoded, setGeocoded] = useState<Record<number, { latitude: number; longitude: number }>>({});
  const geocodeAttemptedRef = useRef<Set<number>>(new Set());
  const geocodeTimersRef = useRef<number[]>([]);

  const load = useCallback(() => {
    api<{ orders: Order[] }>("/api/admin/orders")
      .then((data) => setOrders(data.orders))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load orders"));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    api<{ drivers: Driver[] }>("/api/admin/drivers")
      .then((data) => setDrivers(data.drivers))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const missing = orders.filter((o) => {
      const dest = parseCoordinatePair(o.destLat, o.destLng);
      return (
        o.fulfillment === "delivery" &&
        !dest &&
        o.address &&
        !geocoded[o.id] &&
        !geocodeAttemptedRef.current.has(o.id)
      );
    });
    for (const [index, order] of missing.entries()) {
      geocodeAttemptedRef.current.add(order.id);
      const timer = window.setTimeout(() => {
        geocodeAddress(order.address).then((coords) => {
          if (coords) setGeocoded((prev) => ({ ...prev, [order.id]: coords }));
        });
      }, index * 1200);
      geocodeTimersRef.current.push(timer);
    }
  }, [orders, geocoded]);

  useEffect(() => {
    return () => {
      geocodeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      geocodeTimersRef.current = [];
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
                  <th>GPS updated</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((order) => {
                  const hasGps = Number.isFinite(parseFloat(order.driverLat)) && Number.isFinite(parseFloat(order.driverLng));
  const nameOf = (id: number | null) =>
    id ? drivers.find((d) => d.id === id)?.name || `Driver #${id}` : "";

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
