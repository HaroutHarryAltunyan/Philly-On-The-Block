"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  formatTime,
  money,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type Order,
} from "../../../lib/admin-client";

type Driver = { id: number; name: string; phone: string; status: string };

const NEXT_STATUS: Partial<Record<Order["status"], Order["status"]>> = {
  new: "preparing",
  preparing: "ready",
  ready: "completed",
};

const BACK_STATUS: Partial<Record<Order["status"], Order["status"]>> = {
  preparing: "new",
  ready: "preparing",
  completed: "ready",
};

const PAYMENT_LABELS: Record<Order["paymentStatus"], string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  refunded: "Refunded",
};

function playChime() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const play = (freq: number, start: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime + start);
      oscillator.stop(ctx.currentTime + start + duration + 0.05);
    };
    play(880, 0, 0.18);
    play(1174.66, 0.16, 0.28);
  } catch {
    // sound is optional
  }
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<Order["status"] | "all">("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  const [alert, setAlert] = useState("");
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [assigningTo, setAssigningTo] = useState<number | null>(null);
  const [assignDriverId, setAssignDriverId] = useState<number | null>(null);
  const knownIds = useRef(new Set<number>());

  const load = useCallback(() => {
    api<{ orders: Order[] }>("/api/admin/orders")
      .then((data) => {
        const incoming = data.orders;
        const previous = knownIds.current;
        const fresh = incoming.filter((order) => !previous.has(order.id));
        if (previous.size > 0 && fresh.length > 0) {
          const names = fresh.map((order) => order.orderNumber).join(", ");
          setAlert(`${names} just came in — fire up the griddle!`);
          setNewOrderCount((count) => count + fresh.length);
          playChime();
        }
        knownIds.current = new Set(incoming.map((order) => order.id));
        setOrders(incoming);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load orders"));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!alert) return;
    const timer = window.setTimeout(() => setAlert(""), 12_000);
    return () => clearTimeout(timer);
  }, [alert]);

  useEffect(() => {
    api<{ drivers: Driver[] }>("/api/admin/drivers")
      .then((data) => setDrivers(data.drivers))
      .catch(() => {});
  }, []);

  async function assignDriver(order: Order) {
    if (!assignDriverId) return;
    setBusy(order.id);
    try {
      await api<{ order: Order }>("/api/admin/orders/assign", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id, driverId: assignDriverId }),
      });
      setOrders((current) => current.map((o) => (o.id === order.id ? { ...o, driverId: assignDriverId, status: "delivering" } : o)));
      setSelected((current) => (current?.id === order.id ? { ...current, driverId: assignDriverId, status: "delivering" } : current));
      setAssigningTo(null);
      setAssignDriverId(null);
      setAlert(`Assigned to driver`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign driver");
    } finally {
      setBusy(null);
    }
  }

  async function unassignDriver(order: Order) {
    setBusy(order.id);
    try {
      await api<{ order: Order }>("/api/admin/orders/unassign", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id }),
      });
      setOrders((current) => current.map((o) => (o.id === order.id ? { ...o, driverId: null, status: "ready" } : o)));
      setSelected((current) => (current?.id === order.id ? { ...current, driverId: null, status: "ready" } : current));
      setAlert(`Driver unassigned`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unassign driver");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(order: Order, status: Order["status"]) {
    setBusy(order.id);
    setError("");
    try {
      const result = await api<{ order: Order }>(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setOrders((current) => current.map((o) => (o.id === order.id ? result.order : o)));
      setSelected((current) => (current?.id === order.id ? result.order : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setBusy(null);
    }
  }

  async function startDelivery(order: Order) {
    setBusy(order.id);
    setError("");
    try {
      await api<{ order: Order }>(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "delivering" }),
      });
      setOrders((current) =>
        current.map((o) => (o.id === order.id ? { ...o, status: "delivering" } : o)),
      );
      setSelected((current) => (current?.id === order.id ? { ...current, status: "delivering" } : current));
      router.push(`/dashboard/driving?order=${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start delivery");
    } finally {
      setBusy(null);
    }
  }

  function askDelete(order: Order) {
    if (confirmingDelete === order.id) {
      removeOrder(order);
    } else {
      setConfirmingDelete(order.id);
      window.setTimeout(() => setConfirmingDelete((current) => (current === order.id ? null : current)), 4000);
    }
  }

  async function removeOrder(order: Order) {
    setBusy(order.id);
    setError("");
    try {
      await api(`/api/admin/orders/${order.id}`, { method: "DELETE" });
      setOrders((current) => current.filter((o) => o.id !== order.id));
      setSelected((current) => (current?.id === order.id ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete order");
    } finally {
      setBusy(null);
      setConfirmingDelete(null);
    }
  }

  const visible = filter === "all" ? orders : orders.filter((order) => order.status === filter);
  const counts = Object.fromEntries(
    ORDER_STATUSES.map((status) => [status, orders.filter((o) => o.status === status).length]),
  );

  return (
    <>
      <div className="admin-topbar">
        <div>
          <span className="kicker">Back of house</span>
          <h1>Orders</h1>
          <p>Live orders from the customer site — refreshes every 5 seconds.</p>
        </div>
      </div>

      {alert && (
        <div className="alert success" style={{ fontSize: "1rem", padding: "0.9rem 1.1rem" }}>
          🔔 {alert}
        </div>
      )}
      {error && <div className="alert error">{error}</div>}

      <div className="status-actions" style={{ marginBottom: "1rem" }}>
        {(["all", ...ORDER_STATUSES] as const).map((status) => (
          <button
            key={status}
            type="button"
            className={filter === status ? "active" : ""}
            onClick={() => setFilter(status)}
            style={filter === status ? { background: "#badaff" } : undefined}
          >
            {status === "all" ? `All (${orders.length})` : `${ORDER_STATUS_LABELS[status]} (${counts[status] ?? 0})`}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="panel"><div className="panel-body"><div className="empty-state">No orders in this view.</div></div></div>
      ) : (
        <div className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Items</th>
                  <th className="num">Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <tr key={order.id} style={{ cursor: "pointer" }} onClick={() => setSelected(order)}>
                    <td><strong>{order.orderNumber}</strong></td>
                    <td>
                      {order.name}
                      <div style={{ fontSize: "0.78rem", color: "#5c6b7a" }}>{order.phone}</div>
                      {order.fulfillment === "delivery" && order.address && (
                        <div style={{ fontSize: "0.78rem", color: "#5c6b7a" }}>{order.address}</div>
                      )}
                    </td>
                    <td>{order.fulfillment === "delivery" ? "Delivery" : "Pickup"}</td>
                    <td className="order-lines">
                      {order.items.map((line, index) => (
                        <div key={index}>
                          <strong>{line.quantity}×</strong> {line.name}
                          {line.options.length > 0 && <span> · {line.options.join(", ")}</span>}
                        </div>
                      ))}
                      {order.notes && (
                        <div style={{ fontSize: "0.78rem", color: "#3a6ea5", fontStyle: "italic", marginTop: "0.25rem" }}>
                          “{order.notes}”
                        </div>
                      )}
                    </td>
                    <td className="num">
                      <strong>{money(order.totalCents)}</strong>
                      {order.couponCode && (
                        <div style={{ fontSize: "0.72rem", color: "#2e7d32", fontWeight: 700, marginTop: "0.2rem" }}>
                          {order.couponCode} −{money(order.discountCents)}
                        </div>
                      )}
                    </td>
                    <td>
                      {order.paymentStatus === "paid" ? (
                        <span className="status-chip status-ready">{PAYMENT_LABELS[order.paymentStatus]}</span>
                      ) : order.paymentStatus === "refunded" ? (
                        <span className="status-chip status-cancelled">{PAYMENT_LABELS[order.paymentStatus]}</span>
                      ) : (
                        <span className="status-chip status-new">{PAYMENT_LABELS[order.paymentStatus]}</span>
                      )}
                    </td>
                    <td><span className={`status-chip status-${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="status-actions">
                        {order.fulfillment === "delivery" && order.status === "ready" && (
                          <button type="button" disabled={busy === order.id} onClick={() => startDelivery(order)}>
                            Start delivery
                          </button>
                        )}
                        {order.fulfillment === "delivery" && order.status === "delivering" && (
                          <button type="button" disabled={busy === order.id} onClick={() => setStatus(order, "completed")}>
                            Mark delivered
                          </button>
                        )}
                        {BACK_STATUS[order.status] && (
                          <button type="button" disabled={busy === order.id} onClick={() => setStatus(order, BACK_STATUS[order.status]!)}>
                            ← Back to {ORDER_STATUS_LABELS[BACK_STATUS[order.status]!]}
                          </button>
                        )}
                        {NEXT_STATUS[order.status] && (
                          <button type="button" disabled={busy === order.id} onClick={() => setStatus(order, NEXT_STATUS[order.status]!)}>
                            Mark {ORDER_STATUS_LABELS[NEXT_STATUS[order.status]!]}
                          </button>
                        )}
                        {order.status !== "completed" && order.status !== "cancelled" && (
                          <button type="button" disabled={busy === order.id} onClick={() => setStatus(order, "cancelled")}>
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          className={`delete-action${confirmingDelete === order.id ? " confirming" : ""}`}
                          disabled={busy === order.id}
                          onClick={() => askDelete(order)}
                        >
                          {confirmingDelete === order.id ? "Confirm delete?" : "Delete"}
                        </button>
                      </div>
                    </td>
                    <td className="num">{formatTime(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {newOrderCount > 0 && (
        <div className="panel" style={{ borderColor: "#3a6ea5" }}>
          <div className="panel-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontWeight: 700 }}>{newOrderCount} new {newOrderCount === 1 ? "order" : "orders"} since you opened this page.</span>
            <button className="button small secondary" type="button" onClick={() => setNewOrderCount(0)}>
              Clear
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11, 11, 13, 0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            padding: "1rem",
          }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <div
            className="panel"
            style={{ width: "min(640px, 100%)", margin: 0, maxHeight: "90vh", overflow: "auto", background: "#fff" }}
          >
            <div className="panel-head">
              <h2>Order {selected.orderNumber}</h2>
              <button className="button small secondary" type="button" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div className="panel-body">
              <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: "1rem" }}>
                <div className="stat-card" style={{ boxShadow: "none" }}>
                  <div className="stat-label">Total</div>
                  <div className="stat-value" style={{ fontSize: "1.5rem" }}>{money(selected.totalCents)}</div>
                </div>
                <div className="stat-card" style={{ boxShadow: "none" }}>
                  <div className="stat-label">Status</div>
                  <div className="stat-value" style={{ fontSize: "1.1rem", marginTop: "0.5rem" }}>
                    <span className={`status-chip status-${selected.status}`}>{ORDER_STATUS_LABELS[selected.status]}</span>
                  </div>
                </div>
                <div className="stat-card" style={{ boxShadow: "none" }}>
                  <div className="stat-label">Payment</div>
                  <div className="stat-value" style={{ fontSize: "1.1rem", marginTop: "0.5rem" }}>
                    {selected.paymentStatus === "paid" ? (
                      <span className="status-chip status-ready">
                        {selected.paymentMethod === "demo" ? "Demo" : "Paid"}
                      </span>
                    ) : (
                      <span className="status-chip status-new">Unpaid</span>
                    )}
                  </div>
                </div>
              </div>

              <table className="admin-table" style={{ marginBottom: "1rem" }}>
                <tbody>
                  <tr><td style={{ width: 140 }}><strong>Customer</strong></td><td>{selected.name} · {selected.phone}</td></tr>
                  <tr><td><strong>Type</strong></td><td>{selected.fulfillment === "delivery" ? `Delivery — ${selected.address}` : "Pickup"}</td></tr>
                  <tr><td><strong>Placed</strong></td><td>{formatTime(selected.createdAt)}</td></tr>
                  <tr><td><strong>Payment method</strong></td><td>{selected.paymentMethod === "demo" ? "Demo (no charge)" : (selected.paymentMethod || "—")}</td></tr>
                  {selected.notes && (
                    <tr><td><strong>Notes</strong></td><td>{selected.notes}</td></tr>
                  )}
                  {selected.couponCode && (
                    <tr><td><strong>Coupon</strong></td><td>{selected.couponCode} — saves {money(selected.discountCents)}</td></tr>
                  )}
                  {selected.fulfillment === "delivery" && (
                    <tr>
                      <td><strong>Driver</strong></td>
                      <td>
                        {selected.driverId ? (
                          <span>
                            {drivers.find((d) => d.id === selected.driverId)?.name || `Driver #${selected.driverId}`}
                            <button
                              type="button"
                              onClick={() => unassignDriver(selected)}
                              style={{ marginLeft: "0.5rem", border: "1px solid #e3e9f0", background: "#fff", padding: "0.15rem 0.5rem", borderRadius: 4, cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit" }}
                            >
                              Remove
                            </button>
                          </span>
                        ) : (
                          assigningTo === selected.id ? (
                            <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                              <select
                                value={assignDriverId ?? ""}
                                onChange={(e) => setAssignDriverId(e.target.value ? parseInt(e.target.value) : null)}
                                style={{ border: "1px solid #e3e9f0", borderRadius: 4, padding: "0.3rem 0.4rem", fontFamily: "inherit" }}
                              >
                                <option value="">Select driver…</option>
                                {drivers.filter((d) => d.status === "active").map((d) => (
                                  <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => assignDriver(selected)}
                                disabled={!assignDriverId || busy === selected.id}
                                style={{ border: "none", background: "#007404", color: "#fff", padding: "0.3rem 0.6rem", borderRadius: 4, cursor: assignDriverId ? "pointer" : "not-allowed", fontFamily: "inherit", fontSize: "0.78rem" }}
                              >
                                Assign
                              </button>
                              <button
                                type="button"
                                onClick={() => setAssigningTo(null)}
                                style={{ border: "1px solid #e3e9f0", background: "#fff", padding: "0.3rem 0.5rem", borderRadius: 4, cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit" }}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAssigningTo(selected.id)}
                              style={{ border: "1px solid #007404", background: "#fff", color: "#007404", padding: "0.2rem 0.6rem", borderRadius: 4, cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, fontFamily: "inherit" }}
                            >
                              Assign driver
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <table className="admin-table" style={{ marginBottom: "1rem" }}>
                <thead>
                  <tr><th>Item</th><th className="num">Qty</th><th className="num">Line total</th></tr>
                </thead>
                <tbody>
                  {selected.items.map((line, index) => (
                    <tr key={index}>
                      <td>
                        {line.name}
                        {line.options.length > 0 && (
                          <div style={{ fontSize: "0.78rem", color: "#5c6b7a" }}>{line.options.join(", ")}</div>
                        )}
                      </td>
                      <td className="num">{line.quantity}</td>
                      <td className="num">{money((line.priceCents + line.optionPriceCents) * line.quantity)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Subtotal</td><td /><td className="num">{money(selected.subtotalCents)}</td>
                  </tr>
                  <tr>
                    <td>Service fee</td><td /><td className="num">{money(selected.serviceFeeCents)}</td>
                  </tr>
                  {selected.deliveryFeeCents > 0 && (
                    <tr>
                      <td>Delivery fee</td><td /><td className="num">{money(selected.deliveryFeeCents)}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Tax</td><td /><td className="num">{money(selected.taxCents)}</td>
                  </tr>
                  {selected.discountCents > 0 && (
                    <tr>
                      <td>Coupon discount</td><td /><td className="num">−{money(selected.discountCents)}</td>
                    </tr>
                  )}
                  <tr>
                    <td><strong>Total</strong></td><td /><td className="num"><strong>{money(selected.totalCents)}</strong></td>
                  </tr>
                </tbody>
              </table>

              <div className="status-actions">
                {selected.fulfillment === "delivery" && selected.status === "ready" && (
                  <button className="button primary-blue" type="button" disabled={busy === selected.id} onClick={() => startDelivery(selected)}>
                    Start delivery
                  </button>
                )}
                {selected.fulfillment === "delivery" && selected.status === "delivering" && (
                  <button className="button primary-blue" type="button" disabled={busy === selected.id} onClick={() => setStatus(selected, "completed")}>
                    Mark delivered
                  </button>
                )}
                {BACK_STATUS[selected.status] && (
                  <button className="button secondary" type="button" disabled={busy === selected.id} onClick={() => setStatus(selected, BACK_STATUS[selected.status]!)}>
                    ← Back to {ORDER_STATUS_LABELS[BACK_STATUS[selected.status]!]}
                  </button>
                )}
                {NEXT_STATUS[selected.status] && (
                  <button className="button primary-blue" type="button" disabled={busy === selected.id} onClick={() => setStatus(selected, NEXT_STATUS[selected.status]!)}>
                    Mark {ORDER_STATUS_LABELS[NEXT_STATUS[selected.status]!]}
                  </button>
                )}
                {selected.status !== "completed" && selected.status !== "cancelled" && (
                  <button className="button secondary" type="button" disabled={busy === selected.id} onClick={() => setStatus(selected, "cancelled")}>
                    Cancel order
                  </button>
                )}
                <button
                  className={`button secondary delete-action${confirmingDelete === selected.id ? " confirming" : ""}`}
                  type="button"
                  disabled={busy === selected.id}
                  onClick={() => askDelete(selected)}
                >
                  {confirmingDelete === selected.id ? "Confirm delete?" : "Delete order"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
