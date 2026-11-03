"use client";

import { FormEvent, useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const [devLink, setDevLink] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setState("sending");
    try {
      const response = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { sent?: boolean; devLink?: string; error?: string };
      if (!response.ok || !body.sent) throw new Error(body.error ?? "Couldn’t send the link. Try again.");
      setDevLink(body.devLink ?? "");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t send the link. Try again.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="form-grid" role="status">
        <p className="form-success">Check your inbox. We sent a sign-in link to <strong>{email}</strong>. It works once and expires in 15 minutes.</p>
        {devLink && (
          <p className="field-note">
            Local development (no email provider): <a className="inline-link" href={devLink}>open the sign-in link</a>.
          </p>
        )}
        <button type="button" className="text-button" onClick={() => setState("idle")}>Use a different email</button>
      </div>
    );
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label className="field">
        <span>Email</span>
        <input type="email" inputMode="email" autoComplete="email" required maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
