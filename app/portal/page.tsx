"use client";

import { useState, type FormEvent } from "react";
import SiteHeader from "../components/site-header";
import { money } from "../../lib/admin-client";

type PortalHistory = {
  id: number;
  orderNumber: string;
  fulfillment: "pickup" | "delivery";
  status: string;
  paymentStatus: string;
  subtotalCents: number;
  totalCents: number;
  pointsEarned: number;
  pointsRedeemed: number;
  pointsDiscountCents: number;
  createdAt: string;
};

type PortalData = {
  phone: string;
  key: string;
  balance: number;
  pointsValueCents: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  history: PortalHistory[];
};

const inputStyle: React.CSSProperties = {
  border: "2px solid #0b0b0d",
  borderRadius: 8,
  padding: "0.55rem 0.7rem",
  fontSize: "1rem",
  fontFamily: "inherit",
  width: "100%",
};

export default function PortalPage() {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Enter a 10-digit phone number to check your points.");
      setData(null);
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const response = await fetch(`/api/points/balance?phone=${encodeURIComponent(phone)}`);
      const body = (await response.json()) as PortalData & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Couldn’t load your points.");
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t load your points.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.25rem 5rem", fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)" }}>
        <span style={{ color: "#3a6ea5", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase" }}>Philly on the Block</span>
        <h1 style={{ fontSize: "2.2rem", letterSpacing: "-0.02em", margin: "0.25rem 0 0.5rem" }}>Your block points.</h1>
        <p style={{ color: "#5c6b7a", marginTop: 0 }}>
          Earn <strong>1 point per $1</strong> on every order, then redeem <strong>100 points = $1 off</strong> at checkout.
        </p>

        <form
          onSubmit={search}
          style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", margin: "1.5rem 0", alignItems: "end" }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5c6b7a" }}>
            Phone number
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="(818) 555-0133"
              inputMode="tel"
              autoComplete="tel"
              required
              style={inputStyle}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            style={{ border: "2px solid #0b0b0d", background: "#badaff", color: "#0b0b0d", fontWeight: 800, padding: "0.6rem 1.2rem", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            {loading ? "Looking…" : "Check my points"}
          </button>
        </form>

        {error && <p style={{ border: "2px solid #0b0b0d", background: "#f8d7da", borderRadius: 8, padding: "0.7rem 0.9rem", fontWeight: 600 }}>{error}</p>}

        {data && (
          <>
            <section style={{ border: "3px solid #0b0b0d", borderRadius: 16, boxShadow: "8px 8px 0 rgba(11,11,13,0.9)", background: "#fff", padding: "1.5rem", marginTop: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#5c6b7a" }}>Points balance</div>
                  <div style={{ fontSize: "3rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{data.balance.toLocaleString("en-US")}</div>
                  <div style={{ color: "#5c6b7a", fontSize: "0.9rem" }}>≈ {money(data.pointsValueCents)} off your next order</div>
                </div>
                <div style={{ textAlign: "right", fontSize: "0.85rem", color: "#5c6b7a", lineHeight: 1.7 }}>
                  <div>Earned all-time: <strong style={{ color: "#0b0b0d" }}>{data.lifetimeEarned.toLocaleString("en-US")}</strong></div>
                  <div>Redeemed all-time: <strong style={{ color: "#0b0b0d" }}>{data.lifetimeRedeemed.toLocaleString("en-US")}</strong></div>
                  <div style={{ marginTop: "0.5rem" }}>Redeem at checkout — just enter this phone number.</div>
                </div>
              </div>
            </section>

            <section style={{ marginTop: "1.5rem" }}>
              <h2 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>Order history</h2>
              {data.history.length === 0 ? (
                <p style={{ color: "#5c6b7a" }}>No orders yet on this number. Place your first order to start earning points.</p>
              ) : (
                <div style={{ display: "grid", gap: "0.6rem" }}>
                  {data.history.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.4fr 1fr 1fr",
                        gap: "0.5rem 1rem",
                        padding: "0.8rem 1rem",
                        border: "2px solid #0b0b0d",
                        borderRadius: 10,
                        background: item.status === "cancelled" ? "#f3f4f6" : "#fff",
                        fontSize: "0.9rem",
                      }}
                    >
                      <div>
                        <strong>{item.orderNumber}</strong>
                        {item.status === "cancelled" && <span style={{ color: "#b23b3b", fontSize: "0.78rem", marginLeft: "0.4rem" }}>Cancelled</span>}
                        <div style={{ color: "#5c6b7a", fontSize: "0.78rem" }}>
                          {new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          {" · "}{item.fulfillment === "delivery" ? "Delivery" : "Pickup"}
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5c6b7a" }}>Earned</div>
                        <strong>+{item.pointsEarned.toLocaleString("en-US")}</strong>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#5c6b7a" }}>Redeemed</div>
                        <strong style={{ color: item.pointsRedeemed > 0 ? "#3a6ea5" : "#5c6b7a" }}>
                          {item.pointsRedeemed > 0 ? `−${item.pointsRedeemed.toLocaleString("en-US")}` : "—"}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
