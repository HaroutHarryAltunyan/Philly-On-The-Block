"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../lib/admin-client";
import "./admin.css";

type Role = "owner" | "manager" | "kitchen";
type SessionState = { status: "checking" } | { status: "authenticated"; passcodeIsDefault: boolean; role: Role } | { status: "guest" };

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/map", label: "Delivery Map" },
  { href: "/dashboard/reservations", label: "Reservations" },
  { href: "/dashboard/menu", label: "Menu" },
  { href: "/dashboard/coupons", label: "Coupons", managers: true },
  { href: "/dashboard/subscribers", label: "Subscribers", managers: true },
  { href: "/dashboard/drivers/manage", label: "Drivers", managers: true },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionState>({ status: "checking" });
  const [counts, setCounts] = useState<{ orders: number | null; reservations: number | null }>({
    orders: null,
    reservations: null,
  });

  useEffect(() => {
    if (pathname === "/dashboard/drivers" || pathname === "/dashboard/drivers/login" || pathname.startsWith("/dashboard/driving")) return;
    let cancelled = false;

    if (pathname === "/dashboard/login") {
      api<{ authenticated: boolean }>("/api/admin/me")
        .then((me) => {
          if (cancelled) return;
          if (me.authenticated) router.replace("/dashboard");
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }

    api<{ authenticated: boolean; passcodeIsDefault: boolean; staff?: { role: Role } }>("/api/admin/me")
      .then((me) => {
        if (cancelled) return;
        if (me.authenticated) {
          setSession({ status: "authenticated", passcodeIsDefault: me.passcodeIsDefault, role: me.staff?.role ?? "owner" });
        } else {
          setSession({ status: "guest" });
          router.replace("/dashboard/login");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession({ status: "guest" });
          router.replace("/dashboard/login");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  useEffect(() => {
    if (session.status !== "authenticated") return;

    const refreshCounts = () => {
      api<{ stats: { activeOrders: number; pendingReservations: number } }>("/api/admin/stats")
        .then((data) =>
          setCounts({ orders: data.stats.activeOrders, reservations: data.stats.pendingReservations }),
        )
        .catch(() => undefined);
    };

    refreshCounts();
    const timer = window.setInterval(refreshCounts, 10_000);
    return () => window.clearInterval(timer);
  }, [session.status]);

  async function signOut() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.replace("/dashboard/login");
    }
  }

  if (pathname === "/dashboard/drivers" || pathname === "/dashboard/drivers/login" || pathname.startsWith("/dashboard/driving") || pathname === "/dashboard/login") {
    return <>{children}</>;
  }

  if (session.status === "checking" || session.status === "guest") {
    return null;
  }

  const isLogin = pathname === "/dashboard/login";

  return (
    <div className="admin-shell">
      {!isLogin && (
        <aside className="admin-sidebar">
          <div className="admin-brand">
            <img src="/images/Philly_On_The_Block_Logo.png" alt="Philly on the Block" />
            <div>
              <strong>Philly on the Block</strong>
              <small>Back of house</small>
            </div>
          </div>
          <nav className="admin-nav">
            {NAV.filter((item) => !("managers" in item) || (session.status === "authenticated" && session.role !== "kitchen")).map((item) => (
              <a key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
                {item.label}
                {item.href === "/dashboard/orders" && counts.orders !== null && (
                  <span className="nav-count">{counts.orders}</span>
                )}
                {item.href === "/dashboard/reservations" && counts.reservations !== null && (
                  <span className="nav-count">{counts.reservations}</span>
                )}
              </a>
            ))}
          </nav>
          <button className="admin-signout" type="button" onClick={signOut}>
            Sign out
          </button>
        </aside>
      )}
      <main className="admin-main">{children}</main>
    </div>
  );
}
