"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, money, type MenuItem } from "../../../lib/admin-client";

const CATEGORIES = ["Cheesesteaks", "Sides", "Drinks"];

const EMPTY_FORM = {
  name: "",
  category: "Cheesesteaks" as string,
  description: "",
  price: "",
  badge: "",
  image: "",
  imagePosition: "",
  available: true,
  stock: "",
  options: [] as Array<{ name: string; price: string }>,
};

type FormState = typeof EMPTY_FORM;

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const prevent = (event: DragEvent) => {
      event.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  async function uploadFile(file: File) {
    if (file.type && !["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"].includes(file.type)) {
      setUploadError("Unsupported file type. Use JPEG, PNG, WebP, AVIF, or GIF.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadError("Image must be under 8MB.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const response = await fetch("/api/admin/menu/upload", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const body = (await response.json()) as { image?: string; error?: string };
      if (!response.ok || !body.image) {
        throw new Error(body.error ?? "Upload failed");
      }
      setForm((current) => ({ ...current, image: body.image! }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function uploadImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadFile(file);
  }

  useEffect(() => {
    api<{ menu: MenuItem[] }>("/api/admin/menu")
      .then((data) => setItems(data.menu))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load menu"));
  }, []);

  function startAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(item: MenuItem) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      description: item.description,
      price: (item.priceCents / 100).toFixed(2),
      badge: item.badge,
      image: item.image,
      imagePosition: item.imagePosition,
      available: item.available,
      stock: item.stock === null ? "" : String(item.stock),
      options: item.options.map((option) => ({
        name: option.name,
        price: (option.priceCents / 100).toFixed(2),
      })),
    });
    setShowForm(true);
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const priceCents = Math.round(Number(form.price) * 100);
      if (!Number.isFinite(priceCents) || priceCents < 0) {
        throw new Error("Price must be a valid amount");
      }
      const body = {
        name: form.name,
        category: form.category,
        description: form.description,
        priceCents,
        badge: form.badge,
        image: form.image,
        imagePosition: form.imagePosition,
        available: form.available,
        stockQty: form.stock.trim() === "" ? null : Number(form.stock),
        options: form.options
          .filter((option) => option.name.trim() !== "")
          .map((option) => ({
            name: option.name.trim(),
            priceCents: Math.round((Number(option.price) || 0) * 100),
          })),
      };

      if (editing) {
        const result = await api<{ item: MenuItem }>(`/api/admin/menu/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setItems((current) => current.map((item) => (item.id === editing.id ? result.item : item)));
      } else {
        const result = await api<{ item: MenuItem }>("/api/admin/menu", {
          method: "POST",
          body: JSON.stringify({ ...body, sortOrder: items.length }),
        });
        setItems((current) => [...current, result.item]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(item: MenuItem) {
    setError("");
    try {
      const result = await api<{ item: MenuItem }>(`/api/admin/menu/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ available: !item.available }),
      });
      setItems((current) => current.map((i) => (i.id === item.id ? result.item : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item");
    }
  }

  async function removeItem(item: MenuItem) {
    if (!window.confirm(`Delete "${item.name}" from the menu?`)) return;
    setError("");
    try {
      await api(`/api/admin/menu/${item.id}`, { method: "DELETE" });
      setItems((current) => current.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <span className="kicker">Back of house</span>
          <h1>Menu</h1>
          <p>Changes publish to the customer site instantly.</p>
        </div>
        <div className="admin-actions">
          <button className="button primary-blue" type="button" onClick={startAdd}>
            Add item
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {showForm && (
        <section className="panel">
          <div className="panel-head">
            <h2>{editing ? `Edit ${editing.name}` : "New menu item"}</h2>
            <button className="button small secondary" type="button" onClick={() => setShowForm(false)}>
              Close
            </button>
          </div>
          <div className="panel-body">
            <form className="form-grid" onSubmit={saveItem}>
              <div className="field">
                <label htmlFor="mi-name">Name</label>
                <input id="mi-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="mi-category">Category</label>
                <select id="mi-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="mi-price">Price ($)</label>
                <input id="mi-price" type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor="mi-badge">Badge</label>
                <input id="mi-badge" value={form.badge} onChange={(event) => setForm({ ...form, badge: event.target.value })} placeholder="House favorite" />
              </div>
              <div className="field">
                <label htmlFor="mi-description">Description</label>
                <input id="mi-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="mi-image">Image</label>
                <label
                  className={`drop-zone${dragOver ? " drag-over" : ""}${uploading ? " uploading" : ""}`}
                  htmlFor="mi-image-upload"
                  onDragOver={(event) => {
                    if (uploading) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setDragOver(true);
                  }}
                  onDragEnter={(event) => {
                    if (uploading) return;
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    if (uploading) return;
                    const file = event.dataTransfer.files[0];
                    if (file) void uploadFile(file);
                  }}
                >
                  <input
                    id="mi-image-upload"
                    className="visually-hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                    disabled={uploading}
                    onChange={uploadImage}
                  />
                  {uploading ? "Uploading…" : dragOver ? "Drop to upload" : "Drag & drop an image here, or click to browse"}
                </label>
                <small style={{ color: "#5c6b7a" }}>
                  Saved to Cloudflare — the customer site picks it up instantly (JPEG, PNG, WebP, AVIF, or GIF, up to 8MB).
                </small>
                {uploadError && <div className="alert error">{uploadError}</div>}
                {form.image && (
                  <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.9rem" }}>
                    <img
                      src={form.image}
                      alt="Menu item preview"
                      loading="lazy"
                      style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "2px solid #0b0b0d" }}
                    />
                    <button className="button small secondary" type="button" onClick={() => setForm({ ...form, image: "" })}>
                      Remove image
                    </button>
                  </div>
                )}
              </div>
              <div className="field">
                <label htmlFor="mi-position">Image position</label>
                <input id="mi-position" value={form.imagePosition} onChange={(event) => setForm({ ...form, imagePosition: event.target.value })} placeholder="50% 50%" />
              </div>
              <div className="field">
                <label htmlFor="mi-available">Availability</label>
                <select id="mi-available" value={form.available ? "available" : "hidden"} onChange={(event) => setForm({ ...form, available: event.target.value === "available" })}>
                  <option value="available">On the menu</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="mi-stock">Stock count</label>
                <input
                  id="mi-stock"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(event) => setForm({ ...form, stock: event.target.value })}
                  placeholder="Leave blank for unlimited"
                />
                <small style={{ color: "#5c6b7a" }}>Sold out when it reaches 0. Blank = unlimited.</small>
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <span className="field-heading">Add-on options</span>
                <small style={{ color: "#5c6b7a", display: "block", marginBottom: "0.5rem" }}>
                  Extra menu options customers can pick (e.g. &ldquo;Extra meat&rdquo;). Prices are additional to the base price.
                </small>
                <div style={{ display: "grid", gap: "0.4rem" }}>
                  {form.options.map((option, index) => (
                    <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 110px auto", gap: "0.5rem", alignItems: "center" }}>
                      <input
                        value={option.name}
                        onChange={(event) => {
                          const options = [...form.options];
                          options[index] = { ...options[index], name: event.target.value };
                          setForm({ ...form, options });
                        }}
                        placeholder="Option name"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={option.price}
                        onChange={(event) => {
                          const options = [...form.options];
                          options[index] = { ...options[index], price: event.target.value };
                          setForm({ ...form, options });
                        }}
                        placeholder="$ add-on"
                      />
                      <button
                        type="button"
                        className="button small secondary"
                        onClick={() => setForm({ ...form, options: form.options.filter((_, i) => i !== index) })}
                        aria-label="Remove option"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button small secondary"
                    onClick={() => setForm({ ...form, options: [...form.options, { name: "", price: "" }] })}
                  >
                    + Add option
                  </button>
                </div>
              </div>
              <button className="button primary-blue" type="submit" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add to menu"}
              </button>
            </form>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h2>Menu items</h2></div>
        <div className="panel-body" style={{ padding: 0 }}>
          {items.length === 0 ? (
            <div className="empty-state">No menu items yet. Add your first item.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th className="num">Price</th>
                  <th>Badge</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <div style={{ fontSize: "0.78rem", color: "#5c6b7a", maxWidth: 340 }}>
                        {item.description}
                      </div>
                      {item.options.length > 0 && (
                        <div style={{ fontSize: "0.75rem", color: "#5c6b7a", marginTop: "0.25rem" }}>
                          {item.options.map((option) => `${option.name} +${money(option.priceCents)}`).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td>{item.category}</td>
                    <td className="num">{money(item.priceCents)}</td>
                    <td>{item.badge || "—"}</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", alignItems: "flex-start" }}>
                        <button
                          type="button"
                          className={`status-chip status-${item.available ? "completed" : "cancelled"}`}
                          style={{ border: 0, cursor: "pointer" }}
                          onClick={() => toggleAvailable(item)}
                          title={item.available ? "Click to hide from customers" : "Click to show to customers"}
                        >
                          {item.available ? "On menu" : "Hidden"}
                        </button>
                        {item.stock !== null && (
                          <span className={`status-chip ${item.stock === 0 ? "status-cancelled" : item.stock <= 5 ? "status-preparing" : "status-completed"}`}>
                            {item.stock === 0 ? "Sold out" : `${item.stock} left`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="status-actions">
                        <button type="button" onClick={() => startEdit(item)}>Edit</button>
                        <button type="button" onClick={() => removeItem(item)}>Delete</button>
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
