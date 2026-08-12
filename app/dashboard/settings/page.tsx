"use client";

import { FormEvent, useEffect, useState } from "react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type DayHours = [string, string];

type Fees = {
  serviceFeeCents: number;
  taxRatePercent: number;
  deliveryFeeCents: number;
};

export default function SettingsPage() {
  const [hours, setHours] = useState<Record<string, DayHours> | null>(null);
  const [fees, setFees] = useState<Fees | null>(null);
  const [passcodeIsDefault, setPasscodeIsDefault] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(async (response) => {
        const data = (await response.json()) as {
          settings: {
            weeklyHours?: Record<string, DayHours>;
            passcodeIsDefault?: boolean;
            fees?: { serviceFeeCents?: number; taxRatePercent?: number; deliveryFeeCents?: number };
          };
        };
        setHours(data.settings.weeklyHours ?? {});
        setPasscodeIsDefault(Boolean(data.settings.passcodeIsDefault));
        const fees = data.settings.fees;
        setFees(
          fees
            ? {
                serviceFeeCents: fees.serviceFeeCents ?? 150,
                taxRatePercent: fees.taxRatePercent ?? 8,
                deliveryFeeCents: fees.deliveryFeeCents ?? 0,
              }
            : {
                serviceFeeCents: 150,
                taxRatePercent: 8,
                deliveryFeeCents: 0,
              },
        );
      })
      .catch(() => setError("Failed to load settings"));
  }, []);

  function setDay(day: string, hours: DayHours) {
    setHours((current) => ({ ...(current ?? {}), [day]: hours }));
  }

  async function saveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hours) return;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklyHours: hours }),
      });
      const body = (await response.json()) as { error?: string; settings?: { weeklyHours?: Record<string, DayHours> | null } };
      if (!response.ok) throw new Error(body.error ?? "Failed to save hours");
      if (body.settings?.weeklyHours) setHours(body.settings.weeklyHours);
      setSaved("Weekly hours saved. The customer site picks them up automatically.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save hours");
    } finally {
      setSaving(false);
    }
  }

  async function saveFees(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fees) return;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fees }),
      });
      const body = (await response.json()) as { error?: string; settings?: { fees?: Fees } };
      if (!response.ok) throw new Error(body.error ?? "Failed to save fees");
      if (body.settings?.fees) setFees(body.settings.fees);
      setSaved("Pricing saved. New orders use these fees.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save fees");
    } finally {
      setSaving(false);
    }
  }

  async function changePasscode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved("");
    try {
      if (passcode !== confirm) throw new Error("Passcodes don’t match");
      if (passcode.length < 6) throw new Error("Passcode must be at least 6 characters");
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const body = (await response.json()) as { error?: string; settings?: { passcodeIsDefault?: boolean } };
      if (!response.ok) throw new Error(body.error ?? "Failed to change passcode");
      setPasscodeIsDefault(body.settings?.passcodeIsDefault ?? false);
      setPasscode("");
      setConfirm("");
      setSaved("Passcode updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change passcode");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <span className="kicker">Back of house</span>
          <h1>Settings</h1>
          <p>Hours and login for Philly on the Block.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {saved && <div className="alert success">{saved}</div>}

      <section className="panel">
        <div className="panel-head"><h2>Weekly hours</h2></div>
        <div className="panel-body">
          {!hours ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <form onSubmit={saveHours}>
              {DAYS.map((day) => {
                const [open, close] = hours[day] ?? ["closed", ""];
                const closed = open === "closed";
                return (
                  <div className="hours-row" key={day}>
                    <span className="day-name">{day}</span>
                    {closed ? (
                      <>
                        <span className="closed-tag">Closed</span>
                        <span />
                      </>
                    ) : (
                      <>
                        <label>
                          Opens
                          <input type="time" value={open} onChange={(event) => setDay(day, [event.target.value, close])} />
                        </label>
                        <label>
                          Closes
                          <input type="time" value={close} onChange={(event) => setDay(day, [open, event.target.value])} />
                        </label>
                      </>
                    )}
                    <select
                      value={closed ? "closed" : "open"}
                      onChange={(event) =>
                        setDay(day, event.target.value === "closed" ? ["closed", ""] : ["12:00", "21:00"])
                      }
                    >
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                );
              })}
              <div style={{ marginTop: "1rem" }}>
                <button className="button primary-blue" type="submit" disabled={saving || !hours}>
                  {saving ? "Saving…" : "Save hours"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Pricing</h2></div>
        <div className="panel-body">
          {!fees ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <>
              <p style={{ color: "#5c6b7a", marginTop: 0 }}>
                Service and delivery fees are flat per order. Tax is a percentage of the discounted subtotal.
              </p>
              <form onSubmit={saveFees}>
                <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <div className="field">
                    <label htmlFor="fees-service">Service fee ($)</label>
                    <input
                      id="fees-service"
                      type="number"
                      min="0"
                      step="0.01"
                      value={fees ? (fees.serviceFeeCents / 100).toFixed(2) : ""}
                      onChange={(event) => setFees({ ...fees, serviceFeeCents: Math.round(Number(event.target.value) * 100) })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="fees-delivery">Delivery fee ($)</label>
                    <input
                      id="fees-delivery"
                      type="number"
                      min="0"
                      step="0.01"
                      value={fees ? (fees.deliveryFeeCents / 100).toFixed(2) : ""}
                      onChange={(event) => setFees({ ...fees, deliveryFeeCents: Math.round(Number(event.target.value) * 100) })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="fees-tax">Tax rate (%)</label>
                    <input
                      id="fees-tax"
                      type="number"
                      min="0"
                      step="0.01"
                      value={fees ? String(fees.taxRatePercent) : ""}
                      onChange={(event) => setFees({ ...fees, taxRatePercent: Number(event.target.value) })}
                    />
                  </div>
                  <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
                    <button className="button primary-blue" type="submit" disabled={saving || !fees}>
                      {saving ? "Saving…" : "Save pricing"}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Login passcode</h2></div>
        <div className="panel-body">
          {passcodeIsDefault && (
            <div className="alert error">You’re still using the default passcode. Change it now.</div>
          )}
          <form className="form-grid" onSubmit={changePasscode}>
            <div className="field">
              <label htmlFor="pw-new">New passcode</label>
              <input id="pw-new" type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} autoComplete="new-password" required />
            </div>
            <div className="field">
              <label htmlFor="pw-confirm">Confirm passcode</label>
              <input id="pw-confirm" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required />
            </div>
            <button className="button primary-blue" type="submit" disabled={saving || !passcode || !confirm}>
              {saving ? "Saving…" : "Change passcode"}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
