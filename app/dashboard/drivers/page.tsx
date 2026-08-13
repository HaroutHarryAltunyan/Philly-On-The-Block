"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DriverHeader from "../../components/driver-header";
import { api, money, ORDER_STATUS_LABELS } from "@/lib/admin-client";

type DriverSession = { authenticated: true; driver: { id: number; name: string; phone: string } } | { authenticated: false };

type Order = {
  id: number;
  orderNumber: string;
  name: string;
  phone: string;
  address: string;
  fulfillment: string;
  items: Array<{ name: string; quantity: number; options: string[] }>;
  totalCents: number;
  status: string;
  driverId: number | null;
  destLat: string;
  destLng: string;
  createdAt: string;
};

type Tab = "my" | "new";

export default function DriverDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<DriverSession>({ authenticated: false });
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState<number | null>(null);
  const [alert, setAlert] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("my");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<DriverSession>("/api/admin/drivers/me")
      .then((me) => {
        if (!me.authenticated) router.push("/dashboard/drivers/login");
        else {
          setSession(me);
          setLoading(false);
        }
      })
      .catch(() => router.push("/dashboard/drivers/login"));
  }, [router]);

  const loadOrders = () => {
    api<{ orders: Order[] }>("/api/admin/orders")
      .then((data) => setAllOrders(data.orders))
      .catch(() => {});
  };

  useEffect(() => {
    if (!session.authenticated) return;
    loadOrders();
    const timer = window.setInterval(loadOrders, 5000);
    return () => window.clearInterval(timer);
  }, [session.authenticated]);

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(""), 4000);
    return () => clearTimeout(timer);
  }, [alert]);

  if (!session.authenticated) {
    if (loading) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f4f6f8", fontFamily: "inherit" }}>
          <p style={{ color: "#5c6b7a", fontSize: "0.92rem" }}>Loading…</p>
        </div>
      );
    }
    return null;
  }

  const myOrders = allOrders.filter((o) => o.driverId === session.driver.id && o.status !== "completed" && o.status !== "cancelled");
  const availableOrders = allOrders.filter((o) =>
    (!o.driverId || o.driverId === 0) &&
    o.fulfillment === "delivery" &&
    ["new", "preparing", "ready"].includes(o.status)
  );

  async function claimOrder(orderId: number) {
    if (!session.authenticated) return;
    setClaiming(orderId);
    try {
      const res = await api<{ order: Order }>("/api/admin/orders/claim", {
        method: "POST",
        body: JSON.stringify({ orderId, driverId: session.driver.id }),
      });
      loadOrders();
      setAlert(`Claimed order ${res.order.orderNumber}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim order");
    } finally {
      setClaiming(null);
    }
  }
  async function unassignOrder(order: Order) {
    try {
      const res = await api<{ order: Order }>("/api/admin/orders/unassign", {
        method: "POST",
        body: JSON.stringify({ orderId: order.id }),
      });
      loadOrders();
      setAlert(`Released order ${res.order.orderNumber}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release order");
    }
  }

  async function startDelivery(order: Order) {
    try {
      await api<{ order: Order }>(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "delivering" }),
      });
      loadOrders();
      router.push(`/dashboard/driving?order=${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start delivery");
    }
  }

  const displayOrders = activeTab === "my" ? myOrders : availableOrders;
  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f8" }}>
      <DriverHeader driverName={session.driver.name} />

      {/* Tab toggle — like RiderApp */}
      <div style={{
        background: "#fff",
        borderBottom: "2px solid #e3e9f0",
        padding: "0 1.5rem",
        display: "flex",
        gap: 0,
      }}>
        {(["my", "new"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "0.85rem 1.5rem",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.92rem",
              fontWeight: activeTab === tab ? 800 : 600,
              color: activeTab === tab ? "#007404" : "#5c6b7a",
              borderBottom: activeTab === tab ? "3px solid #007404" : "3px solid transparent",
              transition: "all 0.15s ease",
            }}
          >
            {tab === "my" ? `My Orders (${myOrders.length})` : `New Orders (${availableOrders.length})`}
          </button>
        ))}
      </div>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem 1.25rem" }}>
        {alert && (
          <div style={{
            background: "#d4edda",
            color: "#155724",
            padding: "0.7rem 1rem",
            borderRadius: 8,
            marginBottom: "1rem",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}>{alert}</div>
        )}
        {error && (
          <div style={{
            background: "#f8d7da",
            color: "#721c24",
            padding: "0.7rem 1rem",
            borderRadius: 8,
            marginBottom: "1rem",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}>{error}</div>
        )}

        {displayOrders.length === 0 ? (
          <div style={{
            background: "#fff",
            borderRadius: 12,
            padding: "3rem 2rem",
            textAlign: "center",
            color: "#5c6b7a",
            border: "2px solid #e3e9f0",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>{activeTab === "my" ? "📦" : "🔔"}</div>
            <strong style={{ fontSize: "1.1rem", color: "#0b0b0d" }}>
              {activeTab === "my" ? "No active orders" : "No new orders"}
            </strong>
            <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
              {activeTab === "my" ? "Your delivered orders will appear here." : "Check back — orders appear when customers place delivery orders."}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {displayOrders.map((order) => (
              <div key={order.id} style={{
                background: "#fff",
                borderRadius: 12,
                padding: "1.25rem",
                border: "2px solid #e3e9f0",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.6rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "1.05rem" }}>{order.orderNumber}</strong>
                    <span style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      padding: "0.15rem 0.5rem",
                      borderRadius: 999,
                      background: order.status === "delivering" ? "#e8f5e9" : order.status === "ready" ? "#fff7e2" : "#badaff",
                      color: order.status === "delivering" ? "#2e7d32" : order.status === "ready" ? "#8a6d00" : "#1a4a8a",
                      textTransform: "uppercase",
                    }}>
                      {ORDER_STATUS_LABELS[order.status as "new" | "preparing" | "ready" | "delivering" | "completed" | "cancelled"] || order.status}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#007404" }}>{money(order.totalCents)}</div>
                </div>

                <div style={{ fontSize: "0.88rem", color: "#5c6b7a", marginBottom: "0.6rem" }}>
                  <strong style={{ color: "#0b0b0d" }}>{order.name}</strong> · {order.phone}
                </div>
                {order.address && (
                  <div style={{ fontSize: "0.85rem", color: "#5c6b7a", marginBottom: "0.75rem", paddingLeft: "0.5rem", borderLeft: "3px solid #badaff" }}>
                    📍 {order.address}
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {activeTab === "my" && order.status !== "delivering" && order.status !== "completed" && (
                    <button
                      onClick={() => startDelivery(order)}
                      style={{
                        border: "none",
                        background: "#007404",
                        color: "#fff",
                        padding: "0.55rem 1.2rem",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: 700,
                        fontFamily: "inherit",
                        fontSize: "0.88rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      🚗 Start delivery
                    </button>
                  )}
                  {activeTab === "my" && order.status === "delivering" && (
                    <button
                      onClick={() => router.push(`/dashboard/driving?order=${order.id}`)}
                      style={{
                        border: "none",
                        background: "#3a6ea5",
                        color: "#fff",
                        padding: "0.55rem 1.2rem",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: 700,
                        fontFamily: "inherit",
                        fontSize: "0.88rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      🗺️ Open GPS map
                    </button>
                  )}
                  {activeTab === "my" && order.status !== "completed" && order.status !== "cancelled" && (
                    <button
                      onClick={() => unassignOrder(order)}
                      style={{
                        border: "1px solid #e3e9f0",
                        background: "#fff",
                        color: "#5c6b7a",
                        padding: "0.55rem 1.2rem",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: 600,
                        fontFamily: "inherit",
                        fontSize: "0.88rem",
                      }}
                    >
                      Release
                    </button>
                  )}
                  {activeTab === "new" && (
                    <button
                      onClick={() => claimOrder(order.id)}
                      disabled={claiming === order.id}
                      style={{
                        border: "none",
                        background: "#007404",
                        color: "#fff",
                        padding: "0.55rem 1.2rem",
                        borderRadius: 8,
                        cursor: claiming === order.id ? "not-allowed" : "pointer",
                        fontWeight: 700,
                        fontFamily: "inherit",
                        fontSize: "0.88rem",
                        opacity: claiming === order.id ? 0.6 : 1,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      📦 Claim this order
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
