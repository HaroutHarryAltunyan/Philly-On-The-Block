"use client";

import { FormEvent, useMemo, useState } from "react";

type Category = "Cheesesteaks" | "Chicken" | "Sides" | "Drinks";

type MenuItem = {
  id: number;
  name: string;
  category: Category;
  description: string;
  price: number;
  badge?: string;
  heat?: string;
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
    name: "The Blockbuster",
    category: "Cheesesteaks",
    description: "Shaved ribeye, Cooper Sharp, caramelized onions, house long roll.",
    price: 14.5,
    badge: "House favorite",
    art: "blockbuster",
    image: "/images/otb-mascot-right.png",
  },
  {
    id: 2,
    name: "Broad Street Heat",
    category: "Cheesesteaks",
    description: "Ribeye, sharp provolone, long hots, fried onions, cherry pepper relish.",
    price: 15.5,
    heat: "Hot",
    art: "broad-street",
    image: "/images/otb-mascot-left.png",
  },
  {
    id: 3,
    name: "Southside Chicken",
    category: "Chicken",
    description: "Chopped chicken, American cheese, roasted peppers, onions, comeback sauce.",
    price: 13.5,
    art: "southside",
    image: "/images/otb-food-truck.png",
  },
  {
    id: 4,
    name: "Mushroom Row",
    category: "Cheesesteaks",
    description: "Ribeye, provolone, griddled mushrooms, black pepper, garlic jus.",
    price: 15,
    badge: "New",
    art: "mushroom",
    image: "/images/otb-street-sign.png",
  },
  {
    id: 5,
    name: "Loaded Block Fries",
    category: "Sides",
    description: "Crinkle fries, chopped steak, cheese sauce, fried onions, house peppers.",
    price: 8.5,
    badge: "Share it. Or don’t.",
    art: "fries",
    image: "/images/otb-crosswalk.png",
  },
  {
    id: 6,
    name: "Philly Water Ice",
    category: "Drinks",
    description: "Lemon or cherry. Cold, bright, and made for a hot griddle day.",
    price: 4,
    art: "water-ice",
    image: "/images/otb-lamp-post.png",
  },
];

const categories: Array<"All" | Category> = [
  "All",
  "Cheesesteaks",
  "Chicken",
  "Sides",
  "Drinks",
];

const extras = [
  { name: "Extra meat", price: 4 },
  { name: "Long hots", price: 1.25 },
  { name: "Mushrooms", price: 1.25 },
];

const money = (value: number) => `$${value.toFixed(2)}`;

export default function Home() {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [fulfillment, setFulfillment] = useState<"Pickup" | "Delivery">("Pickup");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedCheese, setSelectedCheese] = useState("Cooper Sharp");
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "checkout" | "success">("cart");

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

  function openCustomizer(item: MenuItem) {
    setSelectedItem(item);
    setSelectedCheese(item.category === "Drinks" || item.category === "Sides" ? "No cheese" : "Cooper Sharp");
    setSelectedExtras([]);
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
          <span className="open-status"><i /> Open today · until 11</span>
          <button className="cart-button" type="button" onClick={() => setCartOpen(true)}>
            Bag <span>{itemCount}</span>
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>Since right now</span> Philly, PA</div>
          <h1>
            Built on
            <span>the block.</span>
          </h1>
          <p>
            Big flavor, no shortcuts. Ribeye chopped to order, rolls with the right pull,
            and just enough attitude.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#menu">Order on the block <b>↘</b></a>
            <a className="text-link" href="#story">Meet your new regular spot <span>→</span></a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true">
              <span>J</span><span>M</span><span>K</span>
            </div>
            <div><strong>4.9 neighborhood rating</strong><small>Based on 800+ happy regulars</small></div>
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
            <strong>The Blockbuster</strong>
            <small>Cooper Sharp · fried onions · $14.50</small>
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div>
          <span>Chopped to order</span><b>✦</b><span>Never phoned in</span><b>✦</b>
          <span>Philly born &amp; bread</span><b>✦</b><span>Chopped to order</span><b>✦</b>
          <span>Never phoned in</span><b>✦</b><span>Philly born &amp; bread</span>
        </div>
      </div>

      <section className="order-section" id="menu">
        <div className="section-heading">
          <div>
            <span className="kicker">The main event</span>
            <h2>Choose your damage.</h2>
          </div>
          <p>Everything hits the griddle when you order. No heat lamps. No sad sandwiches.</p>
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
                  onClick={() => openCustomizer(item)}
                  aria-label={`Customize ${item.name}`}
                >
                  <span className="menu-number">0{index + 1}</span>
                  <img className="menu-illustration" src={item.image} alt="" />
                  {item.badge && <span className="menu-badge">{item.badge}</span>}
                </button>
                <div className="menu-info">
                  <div className="menu-title-row">
                    <div>
                      <span className="menu-category">{item.category}{item.heat ? ` · ${item.heat}` : ""}</span>
                      <h3>{item.name}</h3>
                    </div>
                    <strong>{money(item.price)}</strong>
                  </div>
                  <p>{item.description}</p>
                  <button type="button" className="add-button" onClick={() => openCustomizer(item)}>
                    Customize <span>+</span>
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
            Philly on the Block is our love letter to the corner shops that feed a city.
            Good beef, honest rolls, a screaming-hot griddle, and people who remember your order.
          </p>
        </div>
        <div className="story-principles">
          <article><span>01</span><h3>Chopped fresh</h3><p>Every steak meets the griddle after you order it.</p></article>
          <article><span>02</span><h3>Built right</h3><p>Balance in every bite, from first crunch to last drip.</p></article>
          <article><span>03</span><h3>Block energy</h3><p>Fast, loud, welcoming, and always worth the walk.</p></article>
        </div>
      </section>

      <section className="visit-section" id="visit">
        <div className="visit-card">
          <span className="kicker">Find the block</span>
          <h2>Pull up hungry.</h2>
          <p>Philadelphia, Pennsylvania<br />Full address announced soon.</p>
          <div className="hours">
            <div><span>Mon–Thu</span><strong>11am–10pm</strong></div>
            <div><span>Fri–Sat</span><strong>11am–11pm</strong></div>
            <div><span>Sunday</span><strong>12pm–9pm</strong></div>
          </div>
          <a className="button button-light" href="mailto:hello@phillyontheblock.com">Talk to us <span>↗</span></a>
        </div>
        <div className="map-card" aria-hidden="true">
          <img className="visit-lamp" src="/images/otb-lamp-post.png" alt="" />
          <img className="visit-truck" src="/images/otb-food-truck.png" alt="" />
          <span className="map-road road-one">Frankford Ave</span>
          <span className="map-road road-two">Girard Ave</span>
          <span className="map-road road-three">Front St</span>
          <div className="map-pin"><span>P/B</span></div>
          <strong>Right here,<br />very soon.</strong>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <img className="brand-logo" src="/images/otb-logo-sign.png" alt="Philly on the Block" />
        </a>
        <p>Real steak. Real rolls. Real Philly energy.</p>
        <div className="footer-links"><a href="#menu">Menu</a><a href="#visit">Hours</a><a href="mailto:hello@phillyontheblock.com">Contact</a></div>
        <small>© 2026 Philly on the Block · Restaurant concept preview</small>
      </footer>

      {selectedItem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedItem(null)}>
          <section
            className="customizer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customizer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="modal-close" type="button" onClick={() => setSelectedItem(null)} aria-label="Close customizer">×</button>
            <span className="cart-kicker">Make it yours</span>
            <h2 id="customizer-title">{selectedItem.name}</h2>
            <p>{selectedItem.description}</p>

            {selectedItem.category !== "Drinks" && selectedItem.category !== "Sides" && (
              <fieldset>
                <legend><span>Choose your cheese</span><small>Required</small></legend>
                {["Cooper Sharp", "Provolone", "Cheese Whiz", "No cheese"].map((cheese) => (
                  <label className="option-row" key={cheese}>
                    <input
                      type="radio"
                      name="cheese"
                      value={cheese}
                      checked={selectedCheese === cheese}
                      onChange={() => setSelectedCheese(cheese)}
                    />
                    <span>{cheese}</span><b>Included</b>
                  </label>
                ))}
              </fieldset>
            )}

            <fieldset>
              <legend><span>Add something extra</span><small>Optional</small></legend>
              {extras.map((extra) => (
                <label className="option-row" key={extra.name}>
                  <input
                    type="checkbox"
                    checked={selectedExtras.includes(extra.name)}
                    onChange={() => setSelectedExtras((current) => current.includes(extra.name) ? current.filter((item) => item !== extra.name) : [...current, extra.name])}
                  />
                  <span>{extra.name}</span><b>+{money(extra.price)}</b>
                </label>
              ))}
            </fieldset>

            <button
              className="button button-primary modal-add"
              type="button"
              onClick={() => {
                const chosenOptions = [
                  ...(selectedItem.category !== "Drinks" && selectedItem.category !== "Sides" ? [selectedCheese] : []),
                  ...selectedExtras,
                ];
                const extraPrice = extras.filter((extra) => selectedExtras.includes(extra.name)).reduce((sum, extra) => sum + extra.price, 0);
                addToCart(selectedItem, chosenOptions, extraPrice);
              }}
            >
              Add to bag · {money(selectedItem.price + extras.filter((extra) => selectedExtras.includes(extra.name)).reduce((sum, extra) => sum + extra.price, 0))}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
