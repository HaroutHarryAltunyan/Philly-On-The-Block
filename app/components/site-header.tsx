"use client";

import { useEffect, useState } from "react";
import InstallAppButton from "./install-app-button";
import { useShop } from "./shop/shop-context";

export const NAV_LINKS = [
  { href: "/menu", label: "Menu" },
  { href: "/our-story", label: "Our story" },
  { href: "/events", label: "Events" },
  { href: "/visit", label: "Visit" },
  { href: "/track", label: "Track order" },
  { href: "/rewards", label: "Rewards" },
];

export default function SiteHeader({ pathname = "" }: { pathname?: string }) {
  const { status, itemCount, openBag, signedIn, lastAdded } = useShop();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [current, setCurrent] = useState(pathname);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    const timer = window.setTimeout(() => setCurrent(window.location.pathname), 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!lastAdded) return;
    const on = window.setTimeout(() => setBump(true), 0);
    const off = window.setTimeout(() => setBump(false), 650);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [lastAdded]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [menuOpen]);

  const accountHref = signedIn ? "/account" : "/login";
  const accountLabel = signedIn ? "Account" : "Log in";

  return (
    <>
      <header className={`site-header${scrolled ? " is-scrolled" : ""}${menuOpen ? " is-menu-open" : ""}`}>
        <a className="brand" href="/" aria-label="Philly on the Block home">
          <img className="brand-logo" src="/images/otb-logo-header.webp" alt="Philly on the Block" width="168" height="58" />
        </a>

        <nav className="primary-nav" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} aria-current={current.startsWith(link.href) ? "page" : undefined}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <a className={`status-pill${status.open ? " is-open" : ""}`} href="/visit">
            <i aria-hidden="true" /> {status.label}
          </a>
          <a className="header-link" href={accountHref}>{accountLabel}</a>
          <button className={`bag-button${bump ? " is-bumped" : ""}`} type="button" onClick={openBag} aria-label={`Open bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2L5 8Zm3.5 0V6.5a3.5 3.5 0 0 1 7 0V8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
            <span>Bag</span>
            <b>{itemCount}</b>
          </button>
          <button
            className="burger"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span /><span />
          </button>
        </div>
      </header>

      <div id="mobile-menu" className={`mobile-menu${menuOpen ? " is-open" : ""}`} inert={!menuOpen} aria-hidden={!menuOpen}>
        <nav aria-label="Mobile">
          {[{ href: "/", label: "Home" }, ...NAV_LINKS].map((link, index) => (
            <a key={link.href} href={link.href} style={{ transitionDelay: `${menuOpen ? 60 + index * 40 : 0}ms` }} onClick={() => setMenuOpen(false)}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="mobile-menu-foot">
          <a className={`status-pill${status.open ? " is-open" : ""}`} href="/visit"><i aria-hidden="true" /> {status.label}</a>
          <a className="btn btn-light" href={accountHref}>{accountLabel}</a>
          <InstallAppButton />
        </div>
      </div>

      <div className="order-dock">
        <a className="btn btn-primary btn-block" href="/menu">Order now</a>
        <button className="btn btn-dark" type="button" onClick={openBag} aria-label={`Open bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}>
          Bag · {itemCount}
        </button>
      </div>
    </>
  );
}
