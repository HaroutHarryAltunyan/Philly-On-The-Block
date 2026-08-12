"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatTime } from "../../../lib/admin-client";
import { STORE_LOCATION } from "../../../lib/tracking";
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

  const deliveries = useMemo(
    () =>
      orders.filter(
        (o) => o.fulfillment === "delivery" && o.driverId && o.status !== "completed" && o.status !== "cancelled",
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
      const destLat = parseFloat(order.destLat);
      const destLng = parseFloat(order.destLng);
      if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
        list.push({
          lat: destLat,
          lng: destLng,
          kind: "destination",
          label: `${order.orderNumber} — ${order.name} (${order.address})`,
        });
      }
      const driverLat = parseFloat(order.driverLat);
      const driverLng = parseFloat(order.driverLng);
      if (Number.isFinite(driverLat) && Number.isFinite(driverLng)) {
        list.push({
          lat: driverLat,
          lng: driverLng,
          kind: "rider",
          label: `${order.orderNumber} — ${nameOf(order.driverId)}`,
        });
      }
    }
    return list;
  }, [deliveries, nameOf]);

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
          <h2>Active deliveries ({deliveries.length})</h2>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <LiveMap markers={markers} height="520px" />
        </div>
      </div>

      {deliveries.length === 0 ? (
        <div className="panel">
          <div className="panel-body empty-state">
            No active deliveries right now — the truck is at the store.
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h2>Out for delivery</h2>
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
                      <td>{nameOf(order.driverId)}</td>
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
