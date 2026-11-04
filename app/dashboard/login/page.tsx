"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../lib/admin-client";
import "../admin.css";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"passcode" | "staff">("passcode");
  const [passcode, setPasscode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
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
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(mode === "passcode" ? { passcode } : { username, password }),
          ...(needCode ? { code } : {}),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { authenticated?: boolean; error?: string; code?: string };
      if (response.ok && result.authenticated) {
        router.replace("/dashboard");
        return;
      }
      if (result.code === "mfa_required" || result.code === "mfa_invalid") setNeedCode(true);
      setError(result.code === "mfa_required" ? "" : result.error ?? "Login failed");
      setSubmitting(false);
    } catch {
      setError("Login failed");
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
          <img src="/images/otb-logo-header.webp" alt="" />
          <div>
            <strong>Philly on the Block</strong>
            <small>Back of house</small>
          </div>
        </div>
        <h1>Restaurant login</h1>
        <p>Sign in to manage orders, reservations, and the menu.</p>
        <div role="tablist" aria-label="Sign-in method" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {(["passcode", "staff"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={`button small ${mode === value ? "primary-blue" : "secondary"}`}
              onClick={() => {
                setMode(value);
                setNeedCode(false);
                setCode("");
                setError("");
              }}
            >
              {value === "passcode" ? "Owner passcode" : "Staff account"}
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          {mode === "passcode" ? (
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
          ) : (
            <>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input id="username" autoComplete="username" autoCapitalize="none" value={username} onChange={(event) => setUsername(event.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </div>
            </>
          )}
          {needCode && (
            <div className="field">
              <label htmlFor="code">6-digit code from your authenticator app</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required />
            </div>
          )}
          {error && <div className="alert error">{error}</div>}
          {defaultPasscode && !error && (
            <div className="alert success">Default passcode: <strong>philly123</strong> — change it in Settings after logging in.</div>
          )}
          <button className="button primary-blue" type="submit" disabled={submitting || (mode === "passcode" ? !passcode : !username || !password) || (needCode && code.length !== 6)}>
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
