"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/admin-client";

type Driver = {
  id: number;
  name: string;
  phone: string;
  status: "active" | "inactive";
  createdAt: string;
};

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState("");
  const [alert, setAlert] = useState("");
  const [editing, setEditing] = useState<Driver | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");

  const load = () => {
    api<{ drivers: Driver[] }>("/api/admin/drivers")
      .then((data) => setDrivers(data.drivers))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load drivers"));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(""), 3000);
    return () => clearTimeout(timer);
  }, [alert]);

  async function createDriver() {
    if (!formName.trim() || !formPhone.trim() || !formPassword.trim()) {
      setError("Name, phone, and password are required");
      return;
    }
    try {
      const res = await api<{ driver: Driver }>("/api/admin/drivers", {
        method: "POST",
        body: JSON.stringify({ name: formName.trim(), phone: formPhone.trim(), password: formPassword.trim() }),
      });
      setDrivers((prev) => [...prev, res.driver]);
      setShowForm(false);
      setFormName("");
      setFormPhone("");
      setFormPassword("");
      setAlert(`Driver ${res.driver.name} created`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create driver");
    }
  }

  async function updateDriver(driver: Driver) {
    if (!driver.name.trim()) {
      setError("Name is required");
      return;
    }
    try {
      const res = await api<{ driver: Driver }>(`/api/admin/drivers/${driver.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: driver.name, phone: driver.phone, status: driver.status }),
      });
      setDrivers((prev) => prev.map((d) => (d.id === res.driver.id ? res.driver : d)));
      setEditing(null);
      setAlert(`Driver ${res.driver.name} updated`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update driver");
    }
  }

  async function deleteDriver(driver: Driver) {
    if (!confirm(`Delete driver ${driver.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/drivers/${driver.id}`, { method: "DELETE" });
      setDrivers((prev) => prev.filter((d) => d.id !== driver.id));
      setAlert(`Driver ${driver.name} deleted`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete driver");
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <span className="kicker">Fleet</span>
          <h1>Drivers</h1>
          <p>Manage your delivery drivers — add, edit, and deactivate accounts.</p>
        </div>
        <button
          className="button primary-blue"
          type="button"
          onClick={() => setShowForm(true)}
          style={{ border: "none", background: "#007404", color: "#fff", padding: "0.6rem 1.2rem", borderRadius: 8, cursor: "pointer", fontWeight: 800, fontFamily: "inherit", fontSize: "0.9rem" }}
        >
          + Add driver
        </button>
      </div>

      {alert && <div className="alert success" style={{ fontSize: "1rem", padding: "0.9rem 1.1rem" }}>{alert}</div>}
      {error && <div className="alert error">{error}</div>}

      {showForm && (
        <div className="panel" style={{ marginBottom: "1rem", borderColor: "#007404" }}>
          <div className="panel-body">
            <h3 style={{ marginTop: 0 }}>Add new driver</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.82rem", fontWeight: 700, color: "#5c6b7a" }}>
                Name
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Driver name" style={{ border: "1px solid #e3e9f0", borderRadius: 6, padding: "0.5rem 0.6rem", fontFamily: "inherit" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.82rem", fontWeight: 700, color: "#5c6b7a" }}>
                Phone
                <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="(818) 555-0123" style={{ border: "1px solid #e3e9f0", borderRadius: 6, padding: "0.5rem 0.6rem", fontFamily: "inherit" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.82rem", fontWeight: 700, color: "#5c6b7a" }}>
                Password
                <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Temporary password" style={{ border: "1px solid #e3e9f0", borderRadius: 6, padding: "0.5rem 0.6rem", fontFamily: "inherit" }} />
              </label>
              <button className="button primary-blue" type="button" onClick={createDriver} style={{ border: "none", background: "#007404", color: "#fff", padding: "0.5rem 1rem", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
                Create
              </button>
            </div>
            <button className="button secondary" type="button" onClick={() => setShowForm(false)} style={{ marginTop: "0.75rem" }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id}>
                  {editing?.id === driver.id ? (
                    <>
                      <td>
                        <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ border: "1px solid #e3e9f0", borderRadius: 4, padding: "0.3rem 0.4rem", fontFamily: "inherit", width: "100%" }} />
                      </td>
                      <td>
                        <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} style={{ border: "1px solid #e3e9f0", borderRadius: 4, padding: "0.3rem 0.4rem", fontFamily: "inherit", width: "100%" }} />
                      </td>
                      <td>
                        <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as "active" | "inactive" })} style={{ border: "1px solid #e3e9f0", borderRadius: 4, padding: "0.3rem 0.4rem", fontFamily: "inherit" }}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </td>
                      <td>—</td>
                      <td>
                        <div className="status-actions">
                          <button type="button" onClick={() => updateDriver(editing)}>Save</button>
                          <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><strong>{driver.name}</strong></td>
                      <td>{driver.phone}</td>
                      <td>
                        <span className={`status-chip ${driver.status === "active" ? "status-ready" : "status-cancelled"}`}>
                          {driver.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="num">{new Date(driver.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div className="status-actions">
                          <button type="button" onClick={() => setEditing(driver)}>Edit</button>
                          <button type="button" onClick={() => deleteDriver(driver)} style={{ color: "#dc3545" }}>Delete</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
