"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, formatTime, money, type Broadcast, type Coupon, type Subscriber } from "../../../lib/admin-client";

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<{ subscribers: Subscriber[] }>("/api/admin/subscribers")
      .then((data) => setSubscribers(data.subscribers))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load subscribers"));
  }, []);

  useEffect(() => {
    api<{ coupons: Coupon[] }>("/api/admin/coupons")
      .then((data) => setCoupons(data.coupons))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api<{ broadcasts: Broadcast[] }>("/api/admin/subscribers/broadcasts")
      .then((data) => setBroadcasts(data.broadcasts))
      .catch(() => undefined);
  }, []);

  function startAdd() {
    setEmail("");
    setSaved("");
    setShowForm(true);
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();
    if (!value || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ subscriber: Subscriber }>("/api/admin/subscribers", {
        method: "POST",
        body: JSON.stringify({ email: value }),
      });
      setSubscribers((current) => [result.subscriber, ...current]);
      setSaved(`Added ${result.subscriber.email}.`);
      setShowForm(false);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add email");
    } finally {
      setSaving(false);
    }
  }

  async function remove(subscriber: Subscriber) {
    if (!window.confirm(`Remove ${subscriber.email}?`)) return;
    setError("");
    try {
      await api(`/api/admin/subscribers/${subscriber.id}`, { method: "DELETE" });
      setSubscribers((current) => current.filter((s) => s.id !== subscriber.id));
      setSaved(`Removed ${subscriber.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove email");
    }
  }

  async function sendBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || subscribers.length === 0) return;
    setSending(true);
    setError("");
    setSaved("");
    try {
      const result = await api<{ broadcast: Broadcast; sent: number; failed: number; total: number }>(
        "/api/admin/subscribers/broadcast",
        {
          method: "POST",
          body: JSON.stringify({ subject, message, couponCode }),
        },
      );
      setBroadcasts((current) => [result.broadcast, ...current].slice(0, 25));
      setSubject("");
      setMessage("");
      setCouponCode("");
      setSaved(
        result.failed > 0
          ? `Emailed ${result.sent} of ${result.total} subscribers — ${result.failed} failed.`
          : `Emailed all ${result.total} subscribers.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send announcement");
    } finally {
      setSending(false);
    }
  }

  const activeCoupons = coupons.filter((coupon) => coupon.active);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <span className="kicker">Back of house</span>
          <h1>Subscribers</h1>
          <p>Email addresses from the newsletter signup — send them announcements and coupons.</p>
        </div>
        <div className="admin-actions">
          <button className="button primary-blue" type="button" onClick={startAdd}>
            Add email
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {saved && <div className="alert success">{saved}</div>}

      <section className="panel">
        <div className="panel-head"><h2>Send an announcement</h2></div>
        <div className="panel-body">
          <form className="form-grid" onSubmit={sendBroadcast}>
            <div className="field">
              <label htmlFor="bc-subject">Subject</label>
              <input
                id="bc-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Free Coke with any OTB this weekend"
                maxLength={200}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="bc-coupon">Include coupon</label>
              <select id="bc-coupon" value={couponCode} onChange={(event) => setCouponCode(event.target.value)}>
                <option value="">No coupon</option>
                {activeCoupons.map((coupon) => (
                  <option key={coupon.id} value={coupon.code}>
                    {coupon.code} — {coupon.type === "percent" ? `${coupon.amount}% off` : `${money(coupon.amount)} off`}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="bc-message">Message</label>
              <textarea
                id="bc-message"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={"Hey, it's Philly on the Block!\nFree Coke with any Philly OTB this Saturday…"}
                maxLength={5000}
                required
              />
              {couponCode && (
                <p style={{ fontSize: "0.8rem", color: "#5c6b7a", marginTop: "0.4rem", marginBottom: 0 }}>
                  Code {couponCode} will be added to the end of the message automatically.
                </p>
              )}
            </div>
            <button className="button primary-blue" type="submit" disabled={sending || subscribers.length === 0}>
              {sending
                ? "Sending…"
                : subscribers.length === 0
                  ? "No subscribers yet"
                  : `Send to ${subscribers.length} subscriber${subscribers.length === 1 ? "" : "s"}`}
            </button>
          </form>
        </div>
      </section>

      {showForm && (
        <section className="panel">
          <div className="panel-head">
            <h2>Add email</h2>
            <button className="button small secondary" type="button" onClick={() => setShowForm(false)}>
              Close
            </button>
          </div>
          <div className="panel-body">
            <form className="form-grid" onSubmit={add}>
              <div className="field">
                <label htmlFor="sub-email">Email</label>
                <input
                  id="sub-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <button className="button primary-blue" type="submit" disabled={saving}>
                {saving ? "Adding…" : "Add email"}
              </button>
            </form>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h2>Email list</h2></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {subscribers.length === 0 ? (
            <div className="empty-state">No email subscribers yet.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Subscribed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((subscriber) => (
                  <tr key={subscriber.id}>
                    <td><strong>{subscriber.email}</strong></td>
                    <td>{formatTime(subscriber.createdAt)}</td>
                    <td>
                      <div className="status-actions">
                        <button type="button" onClick={() => remove(subscriber)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Recent sends</h2></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {broadcasts.length === 0 ? (
            <div className="empty-state">No announcements sent yet.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Coupon</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((broadcast) => (
                  <tr key={broadcast.id}>
                    <td><strong>{broadcast.subject}</strong></td>
                    <td>{broadcast.couponCode || "—"}</td>
                    <td>
                      {broadcast.recipientCount}
                      {broadcast.failedCount > 0 && (
                        <div style={{ fontSize: "0.72rem", color: "#b3261e" }}>{broadcast.failedCount} failed</div>
                      )}
                    </td>
                    <td>
                      <span className={`status-chip status-${broadcast.status === "sent" ? "completed" : "cancelled"}`}>
                        {broadcast.status === "sent" ? "Sent" : "Failed"}
                      </span>
                    </td>
                    <td>{broadcast.sentAt ? formatTime(broadcast.sentAt) : formatTime(broadcast.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
