"use client";

import { useMemo, useState, type PointerEvent } from "react";
import type { MenuCategory, StoreMenuItem } from "../../../lib/storefront";
import { useShop } from "./shop-context";

const CATEGORIES: Array<"All" | MenuCategory> = ["All", "Cheesesteaks", "Sides", "Drinks"];
const money = (value: number) => `$${value.toFixed(2)}`;

// Tilt follows the pointer on devices with a precise pointer only; touch
// screens get a plain tap target. Values are written straight to CSS custom
// properties so no React state changes while the pointer moves.
function tilt(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  card.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
  card.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
  card.style.setProperty("--mx", `${((x + 0.5) * 100).toFixed(1)}%`);
  card.style.setProperty("--my", `${((y + 0.5) * 100).toFixed(1)}%`);
}

function untilt(event: PointerEvent<HTMLElement>) {
  const card = event.currentTarget;
  card.style.setProperty("--rx", "0deg");
  card.style.setProperty("--ry", "0deg");
}

export default function MenuGrid({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const { menu, openItem, isSoldOut, fulfillment, setFulfillment } = useShop();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const visible = useMemo(() => (category === "All" ? menu : menu.filter((item) => item.category === category)), [category, menu]);
  // Only show tabs for categories that actually have items (plus All).
  const tabs = CATEGORIES.filter((tab) => tab === "All" || menu.some((item) => item.category === tab));
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <div className="menu-shell">
      <div className="menu-toolbar">
        <div className="chips" role="group" aria-label="Menu categories">
          {tabs.map((tab) => (
            <button key={tab} type="button" aria-pressed={category === tab} onClick={() => setCategory(tab)}>
              {tab}
            </button>
          ))}
        </div>
        <div className="segmented segmented-light" role="group" aria-label="Pickup or delivery">
          {(["Pickup", "Delivery"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={fulfillment === option} onClick={() => setFulfillment(option)}>
              {option}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="empty-note">Nothing in this section right now — check back soon.</p>
      ) : (
        <ul className="menu-grid">
          {visible.map((item: StoreMenuItem, index) => {
            const soldOut = isSoldOut(item);
            return (
              <li key={item.id} className={`dish${soldOut ? " is-sold-out" : ""}`} onPointerMove={tilt} onPointerLeave={untilt}>
                <div className="dish-media">
                  <img
                    src={item.image}
                    alt={`${item.name} from Philly on the Block in Burbank`}
                    loading={index < 3 ? "eager" : "lazy"}
                    decoding="async"
                    width={750}
                    height={1000}
                    style={item.imagePosition ? { objectPosition: item.imagePosition } : undefined}
                  />
                  <span className="dish-glare" aria-hidden="true" />
                  <span className="dish-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  {item.badge && <span className="dish-badge">{item.badge}</span>}
                  {soldOut && <span className="dish-soldout">Sold out</span>}
                </div>
                <div className="dish-info">
                  <div className="dish-row">
                    <Heading className="dish-name">
                      {/* Stretched button: its ::after covers the whole card. */}
                      <button type="button" className="dish-hit" onClick={() => openItem(item)}>
                        {item.name}
                      </button>
                    </Heading>
                    <span className="dish-price">{money(item.price)}</span>
                  </div>
                  <p className="dish-desc">{item.description}</p>
                  <span className="dish-cta" aria-hidden="true">
                    {soldOut ? "Sold out" : <>Add to bag <b>+</b></>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
