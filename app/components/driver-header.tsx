"use client";

import { useRouter } from "next/navigation";

export default function DriverHeader({ driverName }: { driverName?: string }) {
  const router = useRouter();

  async function signOut() {
    try {
      await fetch("/api/admin/drivers/logout", { method: "POST" });
    } finally {
      router.push("/dashboard/login");
    }
  }

  return (
    <header style={{
      background: "#007404",
      color: "#fff",
      padding: "0.85rem 1.5rem",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "0.75rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <img src="/images/Philly_On_The_Block_Logo.png" alt="OTB" style={{ height: 32, width: "auto" }} />
        <span style={{ fontSize: "0.85rem", opacity: 0.85, fontWeight: 600 }}>Rider</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {driverName && (
          <span style={{ fontSize: "0.85rem", opacity: 0.9 }}>
            🟢 {driverName}
          </span>
        )}
        <button
          onClick={signOut}
          style={{
            border: "1px solid rgba(255,255,255,0.4)",
            background: "transparent",
            color: "#fff",
            padding: "0.35rem 0.85rem",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "0.82rem",
            fontWeight: 600,
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
