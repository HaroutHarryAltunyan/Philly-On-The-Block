"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  api,
  formatDateTime,
  RESERVATION_STATUS_LABELS,
  type Reservation,
} from "../../../lib/admin-client";

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    eventType: "",
    partySize: "10",
    dateTime: "",
    notes: "",
  });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);

  function askDelete(reservation: Reservation) {
    if (confirming === reservation.id) {
      removeReservation(reservation);
    } else {
      setConfirming(reservation.id);
      window.setTimeout(() => setConfirming((current) => (current === reservation.id ? null : current)), 4000);
    }
  }

  useEffect(() => {
    api<{ reservations: Reservation[] }>("/api/admin/reservations")
      .then((data) => setReservations(data.reservations))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load reservations"));
  }, []);

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    setCreated("");
    try {
      const result = await api<{ reservation: Reservation }>("/api/admin/reservations", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          eventType: form.eventType,
          partySize: Number(form.partySize),
          dateTime: form.dateTime,
          notes: form.notes,
        }),
      });
      setReservations((current) => [result.reservation, ...current]);
      setForm({ name: "", email: "", phone: "", eventType: "", partySize: "10", dateTime: "", notes: "" });
      setCreated(`${result.reservation.eventType || "Event request"} for ${result.reservation.name} (${result.reservation.partySize} guests)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reservation");
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(reservation: Reservation, status: Reservation["status"]) {
    setBusy(reservation.id);
    setError("");
    try {
      const result = await api<{ reservation: Reservation }>(`/api/admin/reservations/${reservation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setReservations((current) => current.map((r) => (r.id === reservation.id ? result.reservation : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update reservation");
    } finally {
      setBusy(null);
    }
  }

  async function removeReservation(reservation: Reservation) {
    setBusy(reservation.id);
    setError("");
    try {
      await api(`/api/admin/reservations/${reservation.id}`, { method: "DELETE" });
      setReservations((current) => current.filter((r) => r.id !== reservation.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete reservation");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <span className="kicker">Back of house</span>
          <h1>Reservations</h1>
          <p>Event bookings. Confirm or cancel as requests come in.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {created && <div className="alert success">Added {created}.</div>}

      <section className="panel">
        <div className="panel-head"><h2>Add an event request</h2></div>
        <div className="panel-body">
          <form className="form-grid" onSubmit={createReservation}>
            <div className="field">
              <label htmlFor="res-event">Event type</label>
              <input
                id="res-event"
                value={form.eventType}
                onChange={(event) => setForm({ ...form, eventType: event.target.value })}
                placeholder="Birthday party, corporate event…"
              />
            </div>
            <div className="field">
              <label htmlFor="res-name">Name</label>
              <input
                id="res-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Guest name"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="res-email">Email</label>
              <input
                id="res-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="guest@example.com"
              />
            </div>
            <div className="field">
              <label htmlFor="res-phone">Phone</label>
              <input
                id="res-phone"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="(818) 555-0123"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="res-party">Expected guests</label>
              <input
                id="res-party"
                type="number"
                min={1}
                max={500}
                value={form.partySize}
                onChange={(event) => setForm({ ...form, partySize: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="res-time">Date &amp; time</label>
              <input
                id="res-time"
                type="datetime-local"
                value={form.dateTime}
                onChange={(event) => setForm({ ...form, dateTime: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="res-notes">Details</label>
              <input
                id="res-notes"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="Occasion, catering needs, setup…"
              />
            </div>
            <button className="button primary-blue" type="submit" disabled={creating}>
              {creating ? "Adding…" : "Add event request"}
            </button>
          </form>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Upcoming &amp; past bookings</h2></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {reservations.length === 0 ? (
            <div className="empty-state">No event requests yet.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>When</th>
                  <th>Guests</th>
                  <th>Contact</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td><strong>{reservation.eventType || "Unspecified event"}</strong></td>
                    <td>{formatDateTime(reservation.dateTime)}</td>
                    <td>{reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}</td>
                    <td>
                      {reservation.name} · {reservation.phone}
                      {reservation.email && <> · {reservation.email}</>}
                    </td>
                    <td>{reservation.notes || "—"}</td>
                    <td>
                      <span className={`status-chip status-${reservation.status}`}>
                        {RESERVATION_STATUS_LABELS[reservation.status]}
                      </span>
                    </td>
                    <td>
                      <div className="status-actions">
                        {reservation.status !== "confirmed" && (
                          <button type="button" disabled={busy === reservation.id} onClick={() => setStatus(reservation, "confirmed")}>
                            Confirm
                          </button>
                        )}
                        {reservation.status !== "cancelled" && (
                          <button type="button" disabled={busy === reservation.id} onClick={() => setStatus(reservation, "cancelled")}>
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          className={`delete-action${confirming === reservation.id ? " confirming" : ""}`}
                          disabled={busy === reservation.id}
                          onClick={() => askDelete(reservation)}
                        >
                          {confirming === reservation.id ? "Confirm delete?" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
