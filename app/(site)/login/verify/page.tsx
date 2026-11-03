"use client";

import { useEffect, useRef, useState } from "react";

// Reads the one-time token from the URL fragment (never sent to servers or
// leaked via Referer) and exchanges it for a session.
export default function VerifyPage() {
  const [state, setState] = useState<"working" | "error">("working");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState({}, "", window.location.pathname);
    if (!token) {
      queueMicrotask(() => {
        setState("error");
        setMessage("This sign-in link is incomplete. Request a new one.");
      });
      return;
    }
    fetch("/api/account/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => {
        const body = (await response.json()) as { authenticated?: boolean; error?: string };
        if (!response.ok || !body.authenticated) throw new Error(body.error ?? "That link didn’t work. Request a new one.");
        window.location.replace("/account");
      })
      .catch((err: unknown) => {
        setState("error");
        setMessage(err instanceof Error ? err.message : "That link didn’t work. Request a new one.");
      });
  }, []);

  return (
    <section className="auth-shell">
      <div className="auth-card panel" aria-live="polite">
        <p className="eyebrow">Signing in</p>
        {state === "working" ? (
          <h1 className="display-lg">One sec…</h1>
        ) : (
          <>
            <h1 className="display-lg">Link expired.</h1>
            <p className="form-error">{message}</p>
            <a className="btn btn-primary" href="/login">Get a new link</a>
          </>
        )}
      </div>
    </section>
  );
}
