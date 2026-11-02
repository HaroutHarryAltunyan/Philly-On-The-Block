"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, formatDateTime } from "../../../lib/admin-client";

type Role = "owner" | "manager" | "kitchen";
type Me = { authenticated: boolean; staff?: { sid: number; role: Role; name: string }; mfaEnabled?: boolean };
type StaffRow = { id: number; name: string; username: string; role: Role; active: boolean; mfaEnabled: boolean; createdAt: string };
type AuditRow = { id: number; actor: string; actorRole: string; action: string; target: string; detail: unknown; ip: string; createdAt: string };

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including staff accounts and settings",
  manager: "Orders, menu, coupons, drivers, subscribers, activity log",
  kitchen: "Orders, reservations, item on/off and stock",
};

export function SecuritySettings() {
  const [me, setMe] = useState<Me | null>(null);
  const reloadMe = useCallback(() => {
    api<Me>("/api/admin/me").then(setMe).catch(() => setMe(null));
  }, []);
  useEffect(reloadMe, [reloadMe]);

  if (!me?.authenticated || !me.staff) return null;
  return (
    <>
      <TwoFactorPanel enabled={Boolean(me.mfaEnabled)} name={me.staff.name} onChange={reloadMe} />
      {me.staff.role === "owner" && <StaffPanel />}
      {me.staff.role !== "kitchen" && <ActivityPanel />}
    </>
  );
}

function TwoFactorPanel({ enabled, name, onChange }: { enabled: boolean; name: string; onChange: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(action: "setup" | "confirm" | "disable") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ secret?: string; uri?: string; mfaEnabled?: boolean }>("/api/admin/mfa", {
        method: "POST",
        body: JSON.stringify({ action, code }),
      });
      if (action === "setup" && result.secret && result.uri) setSetup({ secret: result.secret, uri: result.uri });
      if (action === "confirm") {
        setSetup(null);
        setMessage("Two-factor is on. You'll need a code from your app each time you sign in.");
        onChange();
      }
      if (action === "disable") {
        setMessage("Two-factor is off.");
        onChange();
      }
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Two-factor sign-in</h2></div>
      <div className="panel-body">
        <p>
          Signed in as <strong>{name}</strong>. Two-factor is <strong>{enabled ? "on" : "off"}</strong>.
          {" "}With it on, signing in also needs a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…).
        </p>
        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}
        {!enabled && !setup && (
          <button className="button primary-blue" type="button" disabled={busy} onClick={() => call("setup")}>
            Set up two-factor
          </button>
        )}
        {setup && (
          <form
            className="form-grid"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void call("confirm");
            }}
          >
            <p>
              In your authenticator app choose <em>Add account → Enter a setup key</em> and type this key, or open the link on this phone:
            </p>
            <code style={{ fontSize: "1.1rem", letterSpacing: "0.12em", wordBreak: "break-all" }}>{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
            <a href={setup.uri}>Open in authenticator app</a>
            <div className="field">
              <label htmlFor="mfa-code">Code from the app</label>
              <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
            </div>
            <button className="button primary-blue" type="submit" disabled={busy || code.length !== 6}>Turn on</button>
          </form>
        )}
        {enabled && (
          <form
            className="form-grid"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void call("disable");
            }}
          >
            <div className="field">
              <label htmlFor="mfa-off">Current code (to turn off)</label>
              <input id="mfa-off" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
            </div>
            <button className="button secondary" type="submit" disabled={busy || code.length !== 6}>Turn off two-factor</button>
          </form>
        )}
      </div>
    </section>
  );
}

function StaffPanel() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "kitchen" as Role });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    api<{ staff: StaffRow[] }>("/api/admin/staff").then((r) => setRows(r.staff)).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await api("/api/admin/staff", { method: "POST", body: JSON.stringify(form) });
      setMessage(`Added ${form.name}. They sign in at the login page with "Staff account".`);
      setForm({ name: "", username: "", password: "", role: "kitchen" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add staff");
    }
  }

  async function update(id: number, patch: Record<string, unknown>, done: string) {
    setError("");
    setMessage("");
    try {
      await api(`/api/admin/staff/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setMessage(done);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Staff accounts</h2></div>
      <div className="panel-body">
        <p>Give each person their own login so the activity log shows who did what. The shared passcode keeps working as the owner login.</p>
        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}
        {rows.length > 0 && (
          <table className="admin-table" style={{ marginBottom: "1rem" }}>
            <thead>
              <tr><th>Name</th><th>Username</th><th>Role</th><th>2FA</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.username}</td>
                  <td>
                    <select
                      aria-label={`Role for ${row.name}`}
                      value={row.role}
                      onChange={(e) => update(row.id, { role: e.target.value }, `${row.name} is now ${e.target.value}.`)}
                    >
                      <option value="owner">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="kitchen">Kitchen</option>
                    </select>
                  </td>
                  <td>
                    {row.mfaEnabled ? (
                      <button className="button small secondary" type="button" onClick={() => update(row.id, { resetMfa: true }, `Two-factor reset for ${row.name}.`)}>
                        Reset
                      </button>
                    ) : (
                      "Off"
                    )}
                  </td>
                  <td>{row.active ? "Active" : "Disabled"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="button small secondary"
                      type="button"
                      onClick={() => {
                        const password = window.prompt(`New password for ${row.name} (10+ characters)`);
                        if (password) void update(row.id, { password }, `Password changed for ${row.name}.`);
                      }}
                    >
                      Reset password
                    </button>{" "}
                    <button
                      className="button small secondary"
                      type="button"
                      onClick={() => update(row.id, { active: !row.active }, `${row.name} ${row.active ? "disabled" : "re-enabled"}.`)}
                    >
                      {row.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form className="form-grid" onSubmit={create}>
          <div className="field">
            <label htmlFor="st-name">Name</label>
            <input id="st-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="st-user">Username</label>
            <input id="st-user" value={form.username} autoCapitalize="none" onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} required />
          </div>
          <div className="field">
            <label htmlFor="st-pass">Temporary password (10+ characters)</label>
            <input id="st-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} />
          </div>
          <div className="field">
            <label htmlFor="st-role">Role</label>
            <select id="st-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="kitchen">Kitchen: {ROLE_HELP.kitchen}</option>
              <option value="manager">Manager: {ROLE_HELP.manager}</option>
              <option value="owner">Owner: {ROLE_HELP.owner}</option>
            </select>
          </div>
          <button className="button primary-blue" type="submit">Add staff member</button>
        </form>
      </div>
    </section>
  );
}

function ActivityPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ entries: AuditRow[] }>("/api/admin/audit?limit=100").then((r) => setRows(r.entries)).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <section className="panel">
      <div className="panel-head"><h2>Activity log</h2></div>
      <div className="panel-body">
        {error && <div className="alert error">{error}</div>}
        {rows.length === 0 && !error ? <p>No activity yet.</p> : null}
        {rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr><th>When</th><th>Who</th><th>Action</th><th>On</th><th>Details</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(row.createdAt)}</td>
                    <td>{row.actor} <small>({row.actorRole})</small></td>
                    <td>{row.action}</td>
                    <td>{row.target}</td>
                    <td><small>{row.detail ? JSON.stringify(row.detail) : ""}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
