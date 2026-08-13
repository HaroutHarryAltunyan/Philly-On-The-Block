"use client";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Philly on the Block home">
        <img className="brand-logo" src="/images/otb-logo-sign.png" alt="Philly on the Block" />
      </a>
      <nav className="desktop-nav" aria-label="Main navigation">
        <a href="/#menu">Menu</a>
        <a href="/#story">Our story</a>
        <a href="/reserve">Events</a>
        <a href="/track">Track order</a>
        <a href="/portal">Rewards</a>
        <a href="/#visit">Visit</a>
      </nav>
      <div className="header-actions" aria-hidden="true" />
    </header>
  );
}
