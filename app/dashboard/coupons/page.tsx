"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, money, type Coupon } from "../../../lib/admin-client";

const EMPTY_FORM = {
  code: "",
  type: "percent" as Coupon["type"],
  amount: "",
  minSubtotal: "",
  active: true,
};

type FormState = typeof EMPTY_FORM;

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ coupons: Coupon[] }>("/api/admin/coupons")
      .then((data) => setCoupons(data.coupons))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load coupons"));
  }, []);

  function startAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(coupon: Coupon) {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      type: coupon.type,
      amount: String(coupon.amount),
      minSubtotal: coupon.minSubtotalCents > 0 ? (coupon.minSubtotalCents / 100).toFixed(2) : "",
      active: coupon.active,
    });
    setShowForm(true);
  }

  function validateAmount(): string | null {
    const amount = Number(form.amount);
    if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      return "Enter a positive amount";
    }
    if (form.type === "percent" && amount > 100) {
      return "Percent must be between 1 and 100";
    }
    return null;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountError = validateAmount();
    if (amountError) {
      setError(amountError);
      return;
    }
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const body = {
        code: form.code,
        type: form.type,
        amount: form.type === "percent" ? Number(form.amount) : Math.round(Number(form.amount) * 100),
        minSubtotalCents: form.minSubtotal.trim() === "" ? 0 : Math.round(Number(form.minSubtotal) * 100),
        active: form.active,
      };

      const result = editing
        ? await api<{ coupon: Coupon }>(`/api/admin/coupons/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await api<{ coupon: Coupon }>("/api/admin/coupons", {
            method: "POST",
            body: JSON.stringify(body),
          });

      if (editing) {
        setCoupons((current) => current.map((c) => (c.id === editing.id ? result.coupon : c)));
      } else {
        setCoupons((current) => [...current, result.coupon]);
      }
      setShowForm(false);
      setSaved(editing ? "Coupon updated." : `Coupon ${result.coupon.code} created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save coupon");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon: Coupon) {
    setSaved("");
    setError("");
    try {
      const result = await api<{ coupon: Coupon }>(`/api/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !coupon.active }),
      });
      setCoupons((current) => current.map((c) => (c.id === coupon.id ? result.coupon : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update coupon");
    }
  }

  async function remove(coupon: Coupon) {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    setError("");
    try {
      await api(`/api/admin/coupons/${coupon.id}`, { method: "DELETE" });
      setCoupons((current) => current.filter((c) => c.id !== coupon.id));
      setSaved(`Coupon ${coupon.code} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete coupon");
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <span className="kicker">Back of house</span>
          <h1>Coupons</h1>
          <p>Discount codes customers can apply at checkout.</p>
        </div>
        <div className="admin-actions">
          <button className="button primary-blue" type="button" onClick={startAdd}>
            New coupon
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {saved && <div className="alert success">{saved}</div>}

      {showForm && (
        <section className="panel">
          <div className="panel-head">
            <h2>{editing ? `Edit ${editing.code}` : "New coupon"}</h2>
            <button className="button small secondary" type="button" onClick={() => setShowForm(false)}>
              Close
            </button>
          </div>
          <div className="panel-body">
            <form className="form-grid" onSubmit={save}>
              <div className="field">
                <label htmlFor="cp-code">Code</label>
                <input
                  id="cp-code"
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                  placeholder="OTB10"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="cp-type">Discount type</label>
                <select id="cp-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as Coupon["type"] })}>
                  <option value="percent">Percent off</option>
                  <option value="fixed">Fixed $ off</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="cp-amount">{form.type === "percent" ? "Percent off" : "Amount off ($)"}</label>
                <input
                  id="cp-amount"
                  type="number"
                  min="0"
                  step={form.type === "percent" ? "1" : "0.01"}
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  placeholder={form.type === "percent" ? "10" : "5.00"}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="cp-min">Minimum subtotal ($) — optional</label>
                <input
                  id="cp-min"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minSubtotal}
                  onChange={(event) => setForm({ ...form, minSubtotal: event.target.value })}
                  placeholder="No minimum"
                />
              </div>
              <div className="field">
                <label htmlFor="cp-active">Status</label>
                <select id="cp-active" value={form.active ? "active" : "paused"} onChange={(event) => setForm({ ...form, active: event.target.value === "active" })}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
              <button className="button primary-blue" type="submit" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create coupon"}
              </button>
            </form>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h2>Active codes</h2></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {coupons.length === 0 ? (
            <div className="empty-state">No coupons yet. Create your first discount code.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Minimum</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td><strong>{coupon.code}</strong></td>
                    <td>
                      {coupon.type === "percent" ? `${coupon.amount}% off` : `${money(coupon.amount)} off`}
                      {coupon.minSubtotalCents > 0 && (
                        <div style={{ fontSize: "0.72rem", color: "#5c6b7a" }}>
                          on {money(coupon.minSubtotalCents)}+ subtotals
                        </div>
                      )}
                    </td>
                    <td>{coupon.minSubtotalCents > 0 ? money(coupon.minSubtotalCents) : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={`status-chip status-${coupon.active ? "completed" : "cancelled"}`}
                        style={{ border: 0, cursor: "pointer" }}
                        onClick={() => toggleActive(coupon)}
                        title={coupon.active ? "Click to pause" : "Click to activate"}
                      >
                        {coupon.active ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td>
                      <div className="status-actions">
                        <button type="button" onClick={() => startEdit(coupon)}>Edit</button>
                        <button type="button" onClick={() => remove(coupon)}>Delete</button>
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