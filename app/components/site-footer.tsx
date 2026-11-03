"use client";

import { FormEvent, useState } from "react";
import { SOCIAL_PROFILES, STORE_PHONE_DISPLAY, STORE_PHONE_TEL } from "../../lib/site";

export default function SiteFooter() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();
    if (!value || state === "submitting") return;
    setState("submitting");
    setMessage("");
    fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: value }) })
      .then(async (response) => {
        const body = (await response.json()) as { subscribed?: boolean; error?: string };
        if (!response.ok || !body.subscribed) throw new Error(body.error ?? "Couldn’t subscribe. Try again.");
        setState("done");
        setMessage("You’re on the list. See you on the block.");
        setEmail("");
      })
      .catch((error: unknown) => {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Couldn’t subscribe. Try again.");
      });
  }

  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-signup">
          <p className="display-lg">Get on the list.</p>
          <p className="muted-light">Block drops, new sauces, and first bites — straight to your inbox.</p>
          <form className="inline-input inline-input-dark" onSubmit={subscribe}>
            <label className="sr-only" htmlFor="footer-email">Email address</label>
            <input
              id="footer-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              maxLength={320}
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (state === "done" || state === "error") setState("idle");
              }}
            />
            <button className="btn btn-primary" type="submit" disabled={state === "submitting"}>
              {state === "submitting" ? "Signing up…" : "Subscribe"}
            </button>
          </form>
          <p className="footer-status" role="status">{message}</p>
        </div>
        <nav className="footer-cols" aria-label="Footer">
          <div>
            <h2>Eat</h2>
            <a href="/menu">Menu</a>
            <a href="/track">Track an order</a>
            <a href="/rewards">Rewards</a>
            <a href="/account">Your account</a>
          </div>
          <div>
            <h2>The block</h2>
            <a href="/our-story">Our story</a>
            <a href="/events">Events &amp; catering</a>
            <a href="/visit">Hours &amp; location</a>
            <a href="/faq">FAQ</a>
          </div>
          <div>
            <h2>Reach us</h2>
            <a href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE_DISPLAY}</a>
            <a href="/contact">Contact</a>
            <a href={SOCIAL_PROFILES.yelp} target="_blank" rel="noopener noreferrer">Yelp ↗</a>
          </div>
        </nav>
      </div>

      <div className="footer-social">
        <a href={SOCIAL_PROFILES.instagram} target="_blank" rel="noopener noreferrer me" aria-label="Instagram, @philly_ontheblock">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" />
          </svg>
          <span>@philly_ontheblock</span>
        </a>
        <a href={SOCIAL_PROFILES.tiktok} target="_blank" rel="noopener noreferrer me" aria-label="TikTok, @philly_otb">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path fill="currentColor" d="M16.6 2h-3.3v13.2a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9a6.3 6.3 0 1 0 5.3 6.2V8.6a8 8 0 0 0 4.4 1.4V6.7a4.6 4.6 0 0 1-4.4-4.7Z" />
          </svg>
          <span>@philly_otb</span>
        </a>
      </div>

      <p className="footer-wordmark" aria-hidden="true">On the block.</p>

      <div className="footer-legal">
        <small>© {new Date().getFullYear()} Philly on the Block · 2600 W Victory Blvd, Burbank, CA 91505</small>
        <span>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </span>
      </div>
    </footer>
  );
}
