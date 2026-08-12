"use client";

import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Philly on the Block home">
        <img className="brand-logo" src="/images/otb-logo-sign.png" alt="Philly on the Block" />
      </Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <Link href="/#menu">Menu</Link>
        <Link href="/#story">Our story</Link>
        <Link href="/reserve">Events</Link>
        <Link href="/track">Track order</Link>
        <Link href="/#visit">Visit</Link>
      </nav>
      <div className="header-actions" aria-hidden="true" />
    </header>
  );
}
