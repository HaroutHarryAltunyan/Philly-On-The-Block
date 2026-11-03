"use client";

import { FormEvent, useState } from "react";

export default function PointsLookup() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ balance: number; pointsValueCents: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Enter a 10-digit phone number.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/points/balance?phone=${encodeURIComponent(phone)}`);
      const body = (await response.json()) as { balance?: number; pointsValueCents?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Couldn’t check points.");
      setResult({ balance: body.balance ?? 0, pointsValueCents: body.pointsValueCents ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t check points.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="reward-card form-grid" onSubmit={lookup}>
      <p className="eyebrow">Check your balance</p>
      <label className="field">
        <span>Phone number on your orders</span>
        <input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Checking…" : "Check points"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div aria-live="polite">
        {result && (
          <>
            <p className="reward-balance">{result.balance.toLocaleString("en-US")}</p>
            <p>{result.balance > 0 ? `≈ $${(result.pointsValueCents / 100).toFixed(2)} off — redeem at checkout.` : "No points yet on this number. Your next order starts the count."}</p>
          </>
        )}
      </div>
    </form>
  );
}
