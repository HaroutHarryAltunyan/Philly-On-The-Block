"use client";

import { FormEvent, useEffect, useState } from "react";

// Keep in sync with EVENT_TYPES in app/api/reservations/route.ts.
const EVENT_TYPE_OPTIONS = [
  "Private party",
  "Office lunch",
  "Birthday party",
  "Film production",
  "Studio set",
  "Corporate event",
  "Catering order",
  "Other",
];

type Confirmation = { name: string; eventType: string; partySize: number; dateTime: string };

function todayInputValue(): string {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function EventForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", eventType: "", guestCount: "20", date: "", time: "12:00", location: "", message: "", website: "" });
  const [minDate, setMinDate] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Confirmation | null>(null);

  // Date defaults depend on the visitor's timezone, so set them after hydration.
  useEffect(() => {
    const timer = window.setTimeout(() => setMinDate(todayInputValue()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!form.date) {
      setError("Choose a date for your event.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          eventType: form.eventType,
          guestCount: Number(form.guestCount),
          dateTime: new Date(`${form.date}T${form.time}`).toISOString(),
          location: form.location,
          message: form.message,
          website: form.website,
        }),
      });
      const body = (await response.json()) as { reservation?: Confirmation; error?: string };
      if (!response.ok || !body.reservation) throw new Error(body.error ?? "Couldn’t send the request. Try again.");
      setDone(body.reservation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t send the request. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    const when = new Date(done.dateTime).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    return (
      <div className="panel form-grid" role="status">
        <div className="success-mark" aria-hidden="true">✓</div>
        <h3 className="display-md">Request received{done.name ? `, ${done.name.split(" ")[0]}` : ""}.</h3>
        <p>{done.eventType} · {when} · about {done.partySize} guests. We’ll call or email to confirm the details.</p>
        <a className="btn btn-dark" href="/menu">Order something now</a>
      </div>
    );
  }

  return (
    <form className="panel form-grid" onSubmit={submit} noValidate={false}>
      <label className="field">
        <span>Event type</span>
        <select value={form.eventType} onChange={set("eventType")} required>
          <option value="" disabled>Choose one…</option>
          {EVENT_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </label>
      <div className="field-pair">
        <label className="field">
          <span>Your name</span>
          <input value={form.name} onChange={set("name")} autoComplete="name" required maxLength={60} />
        </label>
        <label className="field">
          <span>Estimated guests</span>
          <input type="number" inputMode="numeric" min={1} max={500} value={form.guestCount} onChange={set("guestCount")} required />
        </label>
      </div>
      <div className="field-pair">
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" required />
        </label>
      </div>
      <div className="field-pair">
        <label className="field">
          <span>Event date</span>
          <input type="date" min={minDate || undefined} value={form.date} onChange={set("date")} required />
        </label>
        <label className="field">
          <span>Start time</span>
          <input type="time" value={form.time} onChange={set("time")} required />
        </label>
      </div>
      <label className="field">
        <span>Event location <em>(address or venue)</em></span>
        <input value={form.location} onChange={set("location")} autoComplete="street-address" maxLength={200} placeholder="Studio, office, or address" />
      </label>
      <label className="field">
        <span>Anything else? <em>(optional)</em></span>
        <textarea value={form.message} onChange={set("message")} maxLength={500} placeholder="Menu ideas, dietary needs, setup, timing…" />
      </label>
      {/* Honeypot for bots; hidden from people and assistive tech. */}
      <div className="hp-field" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={submitting}>
        {submitting ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
