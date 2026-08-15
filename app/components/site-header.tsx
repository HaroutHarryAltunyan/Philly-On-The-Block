"use client";

import { useEffect, useState } from "react";
import InstallAppButton from "./install-app-button";
import { BusinessStatus, getBusinessStatus, HourSchedule } from "../../lib/hours";

const NAV_LINKS = [
  { href: "/#menu", label: "Menu" },
  { href: "/#story", label: "Our story" },
  { href: "/reserve", label: "Events" },
  { href: "/track", label: "Track order" },
  { href: "/portal", label: "Rewards" },
  { href: "/#visit", label: "Visit" },
];

const DEFAULT_STATUS: BusinessStatus = { open: false, label: "View today’s hours" };

type SiteHeaderProps = {
  onCartOpen?: () => void;
  itemCount?: number;
  businessStatus?: BusinessStatus | null;
};

export default function SiteHeader({ onCartOpen, itemCount = 0, businessStatus = null }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [fetchedStatus, setFetchedStatus] = useState<BusinessStatus | null>(null);

  useEffect(() => {
    if (businessStatus) return;
    let cancelled = false;

    const load = () =>
      fetch("/api/hours")
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as { weeklyHours?: Record<string, [string, string]> };
        })
        .then((data) => {
          if (cancelled || !data?.weeklyHours) return;
          const converted: Record<string, HourSchedule> = {};
          for (const day of Object.keys(data.weeklyHours)) {
            const [open, close] = data.weeklyHours[day];
            if (open === "closed" || close === "closed") {
              converted[day] = null;
            } else {
              const toMinutes = (value: string) => {
                const [h, m] = value.split(":").map(Number);
                return h * 60 + m;
              };
              converted[day] = [toMinutes(open), toMinutes(close)];
            }
          }
          setFetchedStatus(getBusinessStatus(converted));
        })
        .catch(() => undefined);

    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [businessStatus]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const status = businessStatus ?? fetchedStatus ?? DEFAULT_STATUS;

  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Philly on the Block home">
        <img className="brand-logo" src="/images/Philly_On_The_Block_Logo.png" alt="Philly on the Block" />
      </a>

      <nav className="desktop-nav" aria-label="Main navigation">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="header-actions">
        <a className={`open-status ${status.open ? "" : "closed"}`} href="/#visit">
          <i /> {status.label}
        </a>
        <a className="login-button" href="/portal">
          Log in
        </a>
        {onCartOpen ? (
          <button className="cart-button" type="button" onClick={onCartOpen}>
            Bag <span>{itemCount}</span>
          </button>
        ) : (
          <a className="cart-button" href="/?cart=1">
            Bag <span>{itemCount}</span>
          </a>
        )}
        <InstallAppButton />
      </div>

      <button
        className={`burger ${menuOpen ? "is-open" : ""}`}
        type="button"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>

      <div className={`mobile-menu ${menuOpen ? "is-open" : ""}`}>
        <nav aria-label="Mobile navigation">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="mobile-menu-footer">
          <a className={`open-status ${status.open ? "" : "closed"}`} href="/#visit">
            <i /> {status.label}
          </a>
          <a className="login-button" href="/portal">
            Log in
          </a>
          <InstallAppButton />
        </div>
      </div>
    </header>
  );
}
