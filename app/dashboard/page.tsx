"use client";

import { useEffect, useState } from "react";
import {
  api,
  formatDateTime,
  formatTime,
  money,
  ORDER_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  type Stats,
} from "../../lib/admin-client";

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api<{ stats: Stats }>("/api/admin/stats")
        .then((data) => {
          if (cancelled) return;
          setStats(data.stats);
          setLastUpdated(new Date());
          setError("");
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
        });
    };
    load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <span className="kicker">Back of house</span>
          <h1>Overview</h1>
          <p>Today at Philly on the Block — refreshes every 10 seconds.</p>
        </div>
        <div className="admin-actions">
          <a className="button secondary" href="/dashboard/orders">
            View orders
          </a>
          <a className="button primary-blue" href="/dashboard/reservations">
            New event request
          </a>
        </div>
      </div>

      {lastUpdated && (
        <p style={{ color: "#5c6b7a", fontSize: "0.82rem", marginTop: "0.4rem" }}>
          Updated {lastUpdated.toLocaleTimeString()} · new orders appear here within ~10 seconds
        </p>
      )}

      {error && <div className="alert error">{error}</div>}

      {!stats ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Orders today</div>
              <div className="stat-value">{stats.todayOrders}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Revenue today</div>
              <div className="stat-value highlight">{money(stats.revenueCents)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">In the kitchen</div>
              <div className="stat-value">{stats.activeOrders}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Upcoming tables</div>
              <div className="stat-value">{stats.pendingReservations}</div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-head">
              <h2>Recent orders</h2>
              <a className="button small secondary" href="/dashboard/orders">
                All orders →
              </a>
            </div>
            <div className="panel-body">
              {stats.recentOrders.length === 0 ? (
                <div className="empty-state">
                  No orders yet. Customer checkouts land here in real time.
                </div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Items</th>
                      <th className="num">Total</th>
                      <th>Status</th>
                      <th>Placed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentOrders.map((order) => (
                      <tr key={order.id}>
                        <td><strong>{order.orderNumber}</strong></td>
                        <td>{order.name}</td>
                        <td>{order.fulfillment === "delivery" ? "Delivery" : "Pickup"}</td>
                        <td className="order-lines">
                          {order.items.map((line, index) => (
                            <div key={index}>
                              <strong>{line.quantity}×</strong> {line.name}
                              {line.options.length > 0 && <span> · {line.options.join(", ")}</span>}
                            </div>
                          ))}
                        </td>
                        <td className="num">{money(order.totalCents)}</td>
                        <td><span className={`status-chip status-${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
                        <td className="num">{formatTime(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Upcoming reservations</h2>
              <a className="button small secondary" href="/dashboard/reservations">
                All event requests →
              </a>
            </div>
            <div className="panel-body">
              {stats.upcomingReservations.length === 0 ? (
                <div className="empty-state">No upcoming bookings.</div>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>When</th>
                      <th>Guests</th>
                      <th>Contact</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.upcomingReservations.map((reservation) => (
                      <tr key={reservation.id}>
                        <td><strong>{reservation.eventType || "Unspecified event"}</strong></td>
                        <td>{formatDateTime(reservation.dateTime)}</td>
                        <td>{reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}</td>
                        <td>{reservation.name} · {reservation.phone}</td>
                        <td><span className={`status-chip status-${reservation.status}`}>{RESERVATION_STATUS_LABELS[reservation.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
