"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, formatTime, type Subscriber } from "../../../lib/admin-client";

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ subscribers: Subscriber[] }>("/api/admin/subscribers")
      .then((data) => setSubscribers(data.subscribers))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load subscribers"));
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

  return (
    <>
      <div className="admin-topbar">
        <div>
          <span className="kicker">Back of house</span>
          <h1>Subscribers</h1>
          <p>Email addresses collected from the newsletter signup.</p>
        </div>
        <div className="admin-actions">
          <button className="button primary-blue" type="button" onClick={startAdd}>
            Add email
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {saved && <div className="alert success">{saved}</div>}

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
    </>
  );
}
