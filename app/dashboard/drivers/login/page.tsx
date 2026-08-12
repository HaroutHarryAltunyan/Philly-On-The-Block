"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function DriverLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/drivers/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      router.push("/dashboard/drivers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #007404 0%, #005a03 100%)",
      padding: "1.5rem",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: "2.5rem 2rem",
        width: "100%",
        maxWidth: 400,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <img src="/images/otb-logo-sign.png" alt="Philly on the Block" style={{ width: 180, height: "auto", marginBottom: "1rem" }} />
          <h1 style={{ fontSize: "1.3rem", margin: "0.5rem 0 0", color: "#0b0b0d" }}>Rider Login</h1>
          <p style={{ color: "#5c6b7a", fontSize: "0.9rem", margin: "0.5rem 0 0" }}>
            Sign in to start delivering
          </p>
        </div>

        <form onSubmit={submit}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: "1rem", fontSize: "0.82rem", fontWeight: 700, color: "#5c6b7a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Phone number
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(818) 555-0123"
              required
              style={{
                border: "2px solid #e3e9f0",
                borderRadius: 8,
                padding: "0.7rem 0.8rem",
                fontSize: "1rem",
                fontFamily: "inherit",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#007404")}
              onBlur={(e) => (e.target.style.borderColor = "#e3e9f0")}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: "1.5rem", fontSize: "0.82rem", fontWeight: 700, color: "#5c6b7a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={{
                border: "2px solid #e3e9f0",
                borderRadius: 8,
                padding: "0.7rem 0.8rem",
                fontSize: "1rem",
                fontFamily: "inherit",
                outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#007404")}
              onBlur={(e) => (e.target.style.borderColor = "#e3e9f0")}
            />
          </label>

          {error && (
            <div style={{
              background: "#f8d7da",
              color: "#721c24",
              borderRadius: 8,
              padding: "0.6rem 0.8rem",
              fontSize: "0.88rem",
              marginBottom: "1rem",
              fontWeight: 600,
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              border: "none",
              background: "#007404",
              color: "#fff",
              fontWeight: 800,
              padding: "0.85rem",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: "1rem",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
