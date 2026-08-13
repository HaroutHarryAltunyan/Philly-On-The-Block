"use client";

import { FormEvent, useEffect, useState } from "react";

type RevealedReservation = {
  id: number;
  name: string;
  eventType: string;
  partySize: number;
  dateTime: string;
  status: "pending" | "confirmed" | "cancelled";
};

const EVENT_TYPE_OPTIONS = [
  "Birthday party",
  "Corporate event",
  "Private party",
  "Catering order",
  "Other",
];

function todayInputValue(): string {
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function ReserveForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState("");
  const [guestCount, setGuestCount] = useState("10");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reservation, setReservation] = useState<RevealedReservation | null>(null);

  useEffect(() => {
    if (date === "") {
      const timer = window.setTimeout(() => setDate(todayInputValue()), 0);
      return () => window.clearTimeout(timer);
    }
  }, [date]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          eventType,
          guestCount: Number(guestCount),
          dateTime: new Date(`${date}T${time}`).toISOString(),
          message,
        }),
      });
      const body = (await response.json()) as {
        reservation?: RevealedReservation;
        error?: string;
      };
      if (!response.ok || !body.reservation) {
        throw new Error(body.error ?? "Couldn't send the event request. Try again.");
      }
      setReservation(body.reservation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the event request. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const formatted = reservation
    ? new Date(reservation.dateTime).toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  const labelStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.3rem",
    fontSize: "0.78rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#5c6b7a",
  };

  const inputStyle: React.CSSProperties = {
    border: "2px solid #0b0b0d",
    borderRadius: 8,
    padding: "0.55rem 0.7rem",
    fontSize: "1rem",
    fontFamily: "inherit",
    background: "#fff",
  };

  return (
    <>
      {error && (
        <p style={{ border: "2px solid #0b0b0d", background: "#f8d7da", borderRadius: 8, padding: "0.7rem 0.9rem", fontWeight: 600 }} role="alert">
          {error}
        </p>
      )}

      {reservation ? (
        <section style={{ border: "3px solid #0b0b0d", borderRadius: 16, boxShadow: "8px 8px 0 rgba(11,11,13,0.9)", background: "#fff", padding: "1.5rem", marginTop: "1.5rem" }}>
          <span style={{ fontSize: "2rem" }}>✓</span>
          <h2 style={{ margin: "0.5rem 0 0.25rem", fontSize: "1.5rem" }}>Request received, {reservation.name}.</h2>
          <p style={{ color: "#5c6b7a" }}>
            {reservation.eventType} · {formatted} · up to {reservation.partySize} guests — we'll be in touch to
            confirm the details.
          </p>
          <a
            href="/"
            style={{ display: "inline-block", marginTop: "0.5rem", border: "2px solid #0b0b0d", background: "#badaff", color: "#0b0b0d", fontWeight: 800, padding: "0.6rem 1.2rem", borderRadius: 8, textDecoration: "none" }}
          >
            Back to the menu
          </a>
        </section>
      ) : (
        <form
          onSubmit={submit}
          style={{ display: "grid", gap: "0.9rem", margin: "1.5rem 0", maxWidth: 480 }}
        >
          <label style={labelStyle}>
            Event type
            <select style={inputStyle} value={eventType} onChange={(event) => setEventType(event.target.value)} required>
              <option value="" disabled>Choose an event type…</option>
              {EVENT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Your name
            <input style={inputStyle} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your name" required />
          </label>
          <label style={labelStyle}>
            Email
            <input style={inputStyle} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label style={labelStyle}>
            Mobile number
            <input style={inputStyle} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="(818) 555-0133" required />
          </label>
          <label style={labelStyle}>
            Expected guests
            <input style={inputStyle} type="number" min={1} max={500} value={guestCount} onChange={(event) => setGuestCount(event.target.value)} required />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label style={labelStyle}>
              Event date
              <input style={inputStyle} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label style={labelStyle}>
              Start time
              <input style={inputStyle} type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
            </label>
          </div>
          <label style={labelStyle}>
            Tell us about it <span style={{ textTransform: "none", color: "#8b98a5" }}>(optional)</span>
            <textarea
              style={{ ...inputStyle, resize: "vertical", font: "inherit", minHeight: 60 }}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={500}
              placeholder="Occasion, catering needs, setup ideas…"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            style={{ border: "2px solid #0b0b0d", background: "#badaff", color: "#0b0b0d", fontWeight: 800, padding: "0.65rem 1.2rem", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: "1rem" }}
          >
            {submitting ? "Sending request…" : "Request a date"}
          </button>
        </form>
      )}
    </>
  );
}
