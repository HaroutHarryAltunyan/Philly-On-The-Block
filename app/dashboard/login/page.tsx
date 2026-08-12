"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../lib/admin-client";
import "../admin.css";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [defaultPasscode, setDefaultPasscode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<{ passcodeIsDefault: boolean }>("/api/admin/me")
      .then((me) => setDefaultPasscode(me.passcodeIsDefault))
      .catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await api<{ authenticated: boolean }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ passcode }),
      });
      if (result.authenticated) {
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  function goToDriverLogin() {
    router.push("/dashboard/drivers/login");
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="admin-brand">
          <img src="/images/otb-logo-sign.png" alt="" />
          <div>
            <strong>Philly on the Block</strong>
            <small>Back of house</small>
          </div>
        </div>
        <h1>Restaurant login</h1>
        <p>Enter your passcode to manage orders, reservations, and the menu.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="passcode">Passcode</label>
            <input
              id="passcode"
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              required
            />
          </div>
          {error && <div className="alert error">{error}</div>}
          {defaultPasscode && !error && (
            <div className="alert success">Default passcode: <strong>philly123</strong> — change it in Settings after logging in.</div>
          )}
          <button className="button primary-blue" type="submit" disabled={submitting || !passcode}>
            {submitting ? "Checking…" : "Get in"}
          </button>
        </form>
        <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid #e3e9f0", textAlign: "center" }}>
          <p style={{ fontSize: "0.85rem", color: "#5c6b7a", marginBottom: "0.75rem" }}>Are you a driver?</p>
          <button
            onClick={goToDriverLogin}
            style={{
              display: "inline-block",
              border: "2px solid #007404",
              background: "#007404",
              color: "#fff",
              padding: "0.6rem 1.5rem",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: "0.92rem",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            🚗 Driver Login
          </button>
        </div>
      </div>
    </div>
  );
}
