"use client";

import { FormEvent, useEffect, useState } from "react";
import { useShop } from "../../components/shop/shop-context";

type AccountOrder = {
  orderNumber: string;
  fulfillment: "pickup" | "delivery";
  status: string;
  paymentStatus: string;
  totalCents: number;
  pointsEarned: number;
  pointsRedeemed: number;
  createdAt: string;
  items: Array<{ name: string; quantity: number; options: string[] }>;
};

type AccountData = {
  customer: { email: string; name: string; phone: string };
  points: { balance: number; pointsValueCents: number; lifetimeEarned: number; lifetimeRedeemed: number } | null;
  orders: AccountOrder[];
};

const STATUS_LABELS: Record<string, string> = {
  new: "Received",
  preparing: "Preparing",
  ready: "Ready",
  delivering: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const date = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function AccountView() {
  const { menu, addToCart, openBag } = useShop();
  const [data, setData] = useState<AccountData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "signed-out" | "error">("loading");
  const [profile, setProfile] = useState({ name: "", phone: "" });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState("");

  const load = () =>
    fetch("/api/account/me")
      .then(async (response) => {
        if (response.status === 401) {
          setState("signed-out");
          return;
        }
        if (!response.ok) throw new Error();
        const body = (await response.json()) as AccountData;
        setData(body);
        setProfile({ name: body.customer.name, phone: body.customer.phone });
        setState("ready");
      })
      .catch(() => setState("error"));

  useEffect(() => {
    void load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");
    setSaveState("saving");
    const response = await fetch("/api/account/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setSaveError(body.error ?? "Couldn’t save. Try again.");
      setSaveState("idle");
      return;
    }
    setSaveState("saved");
    void load();
  }

  async function signOut() {
    await fetch("/api/account/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/";
  }

  function reorder(order: AccountOrder) {
    // Re-adds items still on the menu, at today's prices. Options that no
    // longer exist are dropped.
    let added = 0;
    for (const line of order.items) {
      const item = menu.find((candidate) => candidate.name === line.name);
      if (!item || (item.stock !== null && item.stock <= 0)) continue;
      const options = item.options.filter((option) => line.options.includes(option.name));
      addToCart(item, options.map((option) => option.name), options.reduce((sum, option) => sum + option.priceCents, 0) / 100, line.quantity);
      added += 1;
    }
    if (added > 0) openBag();
  }

  if (state === "loading") {
    return (
      <section className="page-body">
        <p className="display-md" aria-live="polite">Loading your account…</p>
      </section>
    );
  }

  if (state === "signed-out" || state === "error" || !data) {
    return (
      <section className="auth-shell">
        <div className="auth-card panel">
          <p className="eyebrow">Your account</p>
          <h1 className="display-lg">{state === "error" ? "Couldn’t load your account." : "You’re signed out."}</h1>
          <a className="btn btn-primary" href="/login">Log in</a>
        </div>
      </section>
    );
  }

  const points = data.points;
  const toNextDollar = points ? 100 - (points.balance % 100) : 100;

  return (
    <>
      <section className="page-hero account-hero">
        <p className="eyebrow">Your account</p>
        <h1 className="display-xl">{data.customer.name ? `What’s up, ${data.customer.name.split(" ")[0]}.` : "Welcome to the block."}</h1>
        <p className="lede">{data.customer.email}</p>
      </section>

      <section className="page-body">
        <div className="grid-2 account-grid">
          <div className="form-grid">
            <div id="rewards" className="reward-card">
              <p className="eyebrow">Block points</p>
              {points ? (
                <>
                  <p className="reward-balance">{points.balance.toLocaleString("en-US")}</p>
                  <p>≈ {money(points.pointsValueCents)} off your next order</p>
                  <div className="reward-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={100 - toNextDollar} aria-label="Progress to the next $1 of points">
                    <span style={{ width: `${100 - toNextDollar}%` }} />
                  </div>
                  <p className="field-note">{toNextDollar} more points to your next $1. Earned all-time: {points.lifetimeEarned.toLocaleString("en-US")} · Redeemed: {points.lifetimeRedeemed.toLocaleString("en-US")}</p>
                </>
              ) : (
                <p>Add your phone number below to see your points. Points follow the phone number on your orders.</p>
              )}
            </div>

            <form className="panel form-grid" onSubmit={save}>
              <h2 className="display-sm">Profile</h2>
              <label className="field">
                <span>Name</span>
                <input value={profile.name} onChange={(e) => { setProfile((p) => ({ ...p, name: e.target.value })); setSaveState("idle"); }} autoComplete="name" maxLength={60} />
              </label>
              <label className="field">
                <span>Phone <em>(for rewards and faster checkout)</em></span>
                <input type="tel" value={profile.phone} onChange={(e) => { setProfile((p) => ({ ...p, phone: e.target.value })); setSaveState("idle"); }} autoComplete="tel" />
              </label>
              {saveError && <p className="form-error" role="alert">{saveError}</p>}
              <div className="stack-actions">
                <button className="btn btn-dark" type="submit" disabled={saveState === "saving"}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save"}</button>
                <button className="btn btn-ghost-dark" type="button" onClick={signOut}>Sign out everywhere</button>
              </div>
            </form>
          </div>

          <div id="orders">
            <h2 className="display-md">Order history</h2>
            {data.orders.length === 0 ? (
              <div className="panel">
                <p>No orders on this account yet. Orders you place while signed in — and earlier orders with this email — show up here.</p>
                <a className="btn btn-primary" href="/menu">Start an order</a>
              </div>
            ) : (
              <ul className="order-list">
                {data.orders.map((order) => (
                  <li key={order.orderNumber} className={`order-row${order.status === "cancelled" ? " is-cancelled" : ""}`}>
                    <div className="order-row-head">
                      <div>
                        <strong>{order.orderNumber}</strong>
                        <span>{date(order.createdAt)} · {order.fulfillment === "delivery" ? "Delivery" : "Pickup"}</span>
                      </div>
                      <span className={`order-status status-${order.status}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
                    </div>
                    <p className="order-items">{order.items.map((line) => `${line.quantity}× ${line.name}${line.options.length ? ` (${line.options.join(", ")})` : ""}`).join(" · ")}</p>
                    <div className="order-row-foot">
                      <span>{money(order.totalCents)}{order.pointsEarned > 0 ? ` · +${order.pointsEarned} pts` : ""}{order.pointsRedeemed > 0 ? ` · −${order.pointsRedeemed} pts` : ""}</span>
                      <span className="stack-actions">
                        {!["completed", "cancelled"].includes(order.status) && (
                          <a className="btn btn-small btn-dark" href={`/track?number=${encodeURIComponent(order.orderNumber)}`}>Track</a>
                        )}
                        <button className="btn btn-small btn-ghost-dark" type="button" onClick={() => reorder(order)}>Order again</button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
