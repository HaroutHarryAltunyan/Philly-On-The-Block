"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Category = "Cheesesteaks" | "Sides" | "Drinks";

type MenuItem = {
  id: number;
  name: string;
  category: Category;
  description: string;
  price: number;
  badge?: string;
  art: string;
  image: string;
};

type CartLine = {
  lineId: string;
  item: MenuItem;
  quantity: number;
  options: string[];
  optionPrice: number;
};

const menuItems: MenuItem[] = [
  {
    id: 1,
    name: "Philly OTB",
    category: "Cheesesteaks",
    description: "Freshly baked bread, premium meat, grilled onions, spicy pepper, sharp white American, OTB Ranch, and OTB Tang.",
    price: 21.99,
    badge: "House favorite",
    art: "philly-otb",
    image: "/images/otb-mascot-right.png",
  },
  {
    id: 2,
    name: "Classic Philly",
    category: "Cheesesteaks",
    description: "Premium meat topped with grilled onions and sharp white American.",
    price: 21.99,
    art: "classic-philly",
    image: "/images/otb-mascot-left.png",
  },
  {
    id: 3,
    name: "Philly Melt",
    category: "Cheesesteaks",
    description: "Choice of meat, grilled onions, and sharp white American in Texas toast.",
    price: 15.99,
    art: "philly-melt",
    image: "/images/otb-food-truck.png",
  },
  {
    id: 4,
    name: "Fries",
    category: "Sides",
    description: "Shoestring fries topped with house seasoning.",
    price: 5.5,
    art: "fries",
    image: "/images/otb-crosswalk.png",
  },
  {
    id: 5,
    name: "OTB Fries",
    category: "Sides",
    description: "Shoestring fries, steak, grilled onions, sharp white American, OTB Ranch, and OTB Tang.",
    price: 20.99,
    badge: "Loaded",
    art: "otb-fries",
    image: "/images/otb-street-sign.png",
  },
  {
    id: 6,
    name: "Coke Can",
    category: "Drinks",
    description: "The cold, refreshing, sparkling classic that America loves.",
    price: 2.75,
    art: "coke-can",
    image: "/images/otb-lamp-post.png",
  },
  {
    id: 7,
    name: "Diet Coke Can",
    category: "Drinks",
    description: "A crisp, refreshing taste you know and love with zero calories.",
    price: 2.75,
    art: "diet-coke",
    image: "/images/otb-food-truck.png",
  },
  {
    id: 8,
    name: "Bottled Coke",
    category: "Drinks",
    description: "The cold, refreshing, sparkling classic that America loves.",
    price: 5,
    art: "bottled-coke",
    image: "/images/otb-logo-sign.png",
  },
];

const categories: Array<"All" | Category> = [
  "All",
  "Cheesesteaks",
  "Sides",
  "Drinks",
];

const money = (value: number) => `$${value.toFixed(2)}`;

const weeklyHours = [
  ["Monday", "Closed"],
  ["Tuesday", "12–9 PM"],
  ["Wednesday", "12–9 PM"],
  ["Thursday", "12–9 PM"],
  ["Friday", "12–9 PM"],
  ["Saturday", "4–11 PM"],
  ["Sunday", "4–11 PM"],
];

const hoursByDay: Record<string, [number, number] | null> = {
  Monday: null,
  Tuesday: [12 * 60, 21 * 60],
  Wednesday: [12 * 60, 21 * 60],
  Thursday: [12 * 60, 21 * 60],
  Friday: [12 * 60, 21 * 60],
  Saturday: [16 * 60, 23 * 60],
  Sunday: [16 * 60, 23 * 60],
};

function getBusinessStatus() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const day = value("weekday") ?? "Monday";
  const schedule = hoursByDay[day];

  if (!schedule) return { open: false, label: "Closed today" };

  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  const [opens, closes] = schedule;
  if (minutes >= opens && minutes < closes) {
    return { open: true, label: `Open now · until ${closes === 23 * 60 ? "11 PM" : "9 PM"}` };
  }

  return {
    open: false,
    label: minutes < opens ? `Opens today · ${opens === 16 * 60 ? "4 PM" : "12 PM"}` : "Closed for today",
  };
}

const restaurantSchema = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: "Philly on the Block",
  telephone: "+1-818-406-6053",
  address: {
    "@type": "PostalAddress",
    streetAddress: "2600 W Victory Blvd",
    addressLocality: "Burbank",
    addressRegion: "CA",
    postalCode: "91505",
    addressCountry: "US",
  },
  openingHours: ["Tu-Fr 12:00-21:00", "Sa-Su 16:00-23:00"],
};

export default function Home() {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [fulfillment, setFulfillment] = useState<"Pickup" | "Delivery">("Pickup");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "checkout" | "success">("cart");
  const [businessStatus, setBusinessStatus] = useState({ open: false, label: "View today’s hours" });

  useEffect(() => {
    const refreshStatus = () => setBusinessStatus(getBusinessStatus());
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleItems = useMemo(
    () => (category === "All" ? menuItems : menuItems.filter((item) => item.category === category)),
    [category],
  );

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce(
    (sum, line) => sum + (line.item.price + line.optionPrice) * line.quantity,
    0,
  );
  const serviceFee = subtotal > 0 ? 1.5 : 0;
  const tax = subtotal * 0.08;
  const total = subtotal + serviceFee + tax;

  function openItem(item: MenuItem) {
    setSelectedItem(item);
  }

  function addToCart(item: MenuItem, options: string[] = [], optionPrice = 0) {
    setCart((current) => [
      ...current,
      {
        lineId: `${item.id}-${Date.now()}`,
        item,
        quantity: 1,
        options,
        optionPrice,
      },
    ]);
    setSelectedItem(null);
    setCartOpen(true);
    setCheckoutStep("cart");
  }

  function updateQuantity(lineId: string, amount: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.lineId === lineId ? { ...line, quantity: line.quantity + amount } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutStep("success");
  }

  function resetOrder() {
    setCart([]);
    setCheckoutStep("cart");
    setCartOpen(false);
  }

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantSchema) }} />
      <a className="skip-link" href="#menu">
        Skip to menu
      </a>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Philly on the Block home">
          <img className="brand-logo" src="/images/otb-logo-sign.png" alt="Philly on the Block" />
        </a>

        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#menu">Menu</a>
          <a href="#story">Our story</a>
          <a href="#visit">Visit</a>
        </nav>

        <div className="header-actions">
          <a className={`open-status ${businessStatus.open ? "" : "closed"}`} href="#visit">
            <i /> {businessStatus.label}
          </a>
          <button className="cart-button" type="button" onClick={() => setCartOpen(true)}>
            Bag <span>{itemCount}</span>
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>Built for the block</span> Burbank, CA</div>
          <h1>
            Built on
            <span>the block.</span>
          </h1>
          <p>
            Premium meat, freshly baked bread, grilled onions, sharp white American,
            and the house sauces that make it OTB.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#menu">Order on the block <b>↘</b></a>
            <a className="text-link" href="#story">Meet your new regular spot <span>→</span></a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true">
              <span>P</span><span>O</span><span>B</span>
            </div>
            <div><strong>Burbank’s cheesesteak stop</strong><small>Pickup · delivery · late weekends</small></div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Philly on the Block neighborhood illustration">
          <img className="scene-crosswalk" src="/images/otb-crosswalk.png" alt="" />
          <img className="scene-truck" src="/images/otb-food-truck.png" alt="Philly on the Block food truck" />
          <img className="scene-mascot" src="/images/otb-mascot-right.png" alt="Philly on the Block sandwich maker holding a cheesesteak" />
          <img className="scene-sign" src="/images/otb-street-sign.png" alt="Philly on the Block at Philly 8th Street" />
          <div className="hero-stamp" aria-hidden="true">
            <span>Chopped fresh</span>
            <strong>HOT</strong>
            <span>Every order</span>
          </div>
          <div className="hero-ticket">
            <span>Today’s move</span>
            <strong>Philly OTB</strong>
            <small>Sharp white American · OTB Ranch + Tang · $21.99</small>
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div>
          <span>Freshly baked bread</span><b>✦</b><span>OTB Ranch + Tang</span><b>✦</b>
          <span>House favorite: Philly OTB</span><b>✦</b><span>Freshly baked bread</span><b>✦</b>
          <span>OTB Ranch + Tang</span><b>✦</b><span>House favorite: Philly OTB</span>
        </div>
      </div>

      <section className="order-section" id="menu">
        <div className="section-heading">
          <div>
            <span className="kicker">The main event</span>
            <h2>Choose your damage.</h2>
          </div>
          <p>
            Current menu and prices from Philly on the Block. <a href="https://www.yelp.com/menu/philly-on-the-block-burbank" target="_blank" rel="noreferrer">View the Yelp menu ↗</a>
          </p>
        </div>

        <div className="order-toolbar">
          <div className="category-tabs" role="group" aria-label="Menu categories">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? "active" : ""}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="fulfillment-toggle" aria-label="Fulfillment method">
            {(["Pickup", "Delivery"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={fulfillment === option ? "active" : ""}
                aria-pressed={fulfillment === option}
                onClick={() => setFulfillment(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="order-layout">
          <div className="menu-grid">
            {visibleItems.map((item, index) => (
              <article className="menu-card" key={item.id}>
                <button
                  type="button"
                  className={`menu-art ${item.art}`}
                  onClick={() => openItem(item)}
                  aria-label={`View ${item.name}`}
                >
                  <span className="menu-number">0{index + 1}</span>
                  <img className="menu-illustration" src={item.image} alt="" />
                  {item.badge && <span className="menu-badge">{item.badge}</span>}
                </button>
                <div className="menu-info">
                  <div className="menu-title-row">
                    <div>
                      <span className="menu-category">{item.category}</span>
                      <h3>{item.name}</h3>
                    </div>
                    <strong>{money(item.price)}</strong>
                  </div>
                  <p>{item.description}</p>
                  <button type="button" className="add-button" onClick={() => openItem(item)}>
                    Add to bag <span>+</span>
                  </button>
                </div>
              </article>
            ))}
          </div>

          <aside className={`cart-panel ${cartOpen ? "is-open" : ""}`} aria-label="Your order">
            <button className="cart-close" type="button" onClick={() => setCartOpen(false)} aria-label="Close cart">×</button>

            {checkoutStep === "success" ? (
              <div className="order-success">
                <span className="success-check">✓</span>
                <p>Demo order received</p>
                <h3>You’re on the board.</h3>
                <div className="order-number"><span>Order</span><strong>#PTB-042</strong></div>
                <p className="success-copy">Your {fulfillment.toLowerCase()} window is approximately 20–25 minutes.</p>
                <button type="button" className="button button-dark" onClick={resetOrder}>Start another order</button>
              </div>
            ) : checkoutStep === "checkout" ? (
              <form className="checkout-form" onSubmit={submitOrder}>
                <button className="back-button" type="button" onClick={() => setCheckoutStep("cart")}>← Back to bag</button>
                <span className="cart-kicker">Final details</span>
                <h3>Almost yours.</h3>
                <label>
                  Name
                  <input name="name" autoComplete="name" placeholder="Your name" required />
                </label>
                <label>
                  Mobile number
                  <input name="phone" autoComplete="tel" placeholder="(215) 555-0123" required />
                </label>
                {fulfillment === "Delivery" && (
                  <label>
                    Delivery address
                    <input name="address" autoComplete="street-address" placeholder="Street address" required />
                  </label>
                )}
                <div className="demo-note">Demo checkout — no payment will be collected.</div>
                <button className="button button-primary checkout-button" type="submit">
                  Place demo order · {money(total)}
                </button>
              </form>
            ) : (
              <>
                <span className="cart-kicker">Your {fulfillment}</span>
                <div className="cart-heading"><h3>The bag</h3><span>{itemCount} {itemCount === 1 ? "item" : "items"}</span></div>

                {cart.length === 0 ? (
                  <div className="empty-cart">
                    <span>+</span>
                    <h4>Your bag is hungry.</h4>
                    <p>Add a sandwich and we’ll fire up the griddle.</p>
                  </div>
                ) : (
                  <div className="cart-lines">
                    {cart.map((line) => (
                      <div className="cart-line" key={line.lineId}>
                        <div className="cart-line-top">
                          <strong>{line.item.name}</strong>
                          <span>{money((line.item.price + line.optionPrice) * line.quantity)}</span>
                        </div>
                        {line.options.length > 0 && <small>{line.options.join(" · ")}</small>}
                        <div className="quantity-control">
                          <button type="button" onClick={() => updateQuantity(line.lineId, -1)} aria-label={`Remove one ${line.item.name}`}>−</button>
                          <span>{line.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(line.lineId, 1)} aria-label={`Add one ${line.item.name}`}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="cart-totals">
                  <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
                  <div><span>Tax + service</span><strong>{money(serviceFee + tax)}</strong></div>
                  <div className="grand-total"><span>Total</span><strong>{money(total)}</strong></div>
                </div>
                <button
                  className="button button-primary checkout-button"
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => setCheckoutStep("checkout")}
                >
                  Checkout <span>→</span>
                </button>
                <small className="cart-time">Ready in approximately 20–25 minutes</small>
              </>
            )}
          </aside>
        </div>
      </section>

      {cartOpen && <button className="cart-backdrop" type="button" aria-label="Close cart" onClick={() => setCartOpen(false)} />}

      <section className="story-section" id="story">
        <div className="story-label"><span>Our whole story</span><b>↓</b></div>
        <div className="story-copy">
          <p className="story-lead">No shortcuts.<br />No soft opinions.</p>
          <p className="story-body">
            Philly on the Block keeps the menu focused: cheesesteaks, seasoned fries, and cold Cokes.
            Freshly baked bread, premium meat, grilled onions, sharp white American, OTB Ranch,
            and OTB Tang do the heavy lifting.
          </p>
        </div>
        <div className="story-principles">
          <article><span>01</span><h3>The house build</h3><p>Spicy pepper, sharp white American, OTB Ranch, and OTB Tang.</p></article>
          <article><span>02</span><h3>The classic</h3><p>Premium meat, grilled onions, and sharp white American. That’s it.</p></article>
          <article><span>03</span><h3>The loaded side</h3><p>OTB Fries bring the steak, onions, cheese, and both house sauces.</p></article>
        </div>
      </section>

      <section className="visit-section" id="visit">
        <div className="visit-card">
          <span className="kicker">Find the block</span>
          <h2>Pull up hungry.</h2>
          <address>
            <a href="https://www.google.com/maps/dir/?api=1&destination=2600+W+Victory+Blvd%2C+Burbank%2C+CA+91505" target="_blank" rel="noreferrer">
              2600 W Victory Blvd<br />Burbank, CA 91505
            </a>
            <a className="visit-phone" href="tel:+18184066053">(818) 406-6053</a>
          </address>
          <div className="hours">
            {weeklyHours.map(([day, hours]) => (
              <div key={day}><span>{day}</span><strong>{hours}</strong></div>
            ))}
          </div>
          <div className="visit-actions">
            <a className="button button-light" href="https://www.google.com/maps/dir/?api=1&destination=2600+W+Victory+Blvd%2C+Burbank%2C+CA+91505" target="_blank" rel="noreferrer">Get directions <span>↗</span></a>
            <a className="visit-call" href="tel:+18184066053">Call the block <span>→</span></a>
          </div>
        </div>
        <div className="map-card" aria-hidden="true">
          <img className="visit-lamp" src="/images/otb-lamp-post.png" alt="" />
          <img className="visit-truck" src="/images/otb-food-truck.png" alt="" />
          <span className="map-road road-one">W Victory Blvd</span>
          <span className="map-road road-two">Burbank, CA</span>
          <span className="map-road road-three">91505</span>
          <div className="map-pin"><span>P/B</span></div>
          <strong>2600 W<br />Victory Blvd.</strong>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <img className="brand-logo" src="/images/otb-logo-sign.png" alt="Philly on the Block" />
        </a>
        <p>Fresh bread. Big flavor. Block energy.</p>
        <div className="footer-links"><a href="#menu">Menu</a><a href="#visit">Hours</a><a href="tel:+18184066053">Call</a></div>
        <small>© 2026 Philly on the Block · 2600 W Victory Blvd, Burbank, CA</small>
      </footer>

      {selectedItem && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedItem(null);
          }}
        >
          <section
            className="customizer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customizer-title"
          >
            <button className="modal-close" type="button" onClick={() => setSelectedItem(null)} aria-label="Close customizer">×</button>
            <span className="cart-kicker">From the menu</span>
            <h2 id="customizer-title">{selectedItem.name}</h2>
            <p>{selectedItem.description}</p>
            <div className="menu-source-note">
              <span>Menu price</span>
              <strong>{money(selectedItem.price)}</strong>
            </div>

            <button
              className="button button-primary modal-add"
              type="button"
              onClick={() => addToCart(selectedItem)}
            >
              Add to bag · {money(selectedItem.price)}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
