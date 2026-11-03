"use client";

import { useRef, useState } from "react";
import type { StoreMenuItem } from "../../../lib/storefront";
import { useShop } from "./shop-context";
import { useDialog } from "./use-dialog";

const money = (value: number) => `$${value.toFixed(2)}`;

export default function ItemSheet() {
  const { selectedItem, closeItem } = useShop();
  if (!selectedItem) return null;
  // Keyed so choices reset for each product.
  return <ItemSheetPanel key={selectedItem.id} item={selectedItem} onClose={closeItem} />;
}

function ItemSheetPanel({ item, onClose }: { item: StoreMenuItem; onClose: () => void }) {
  const { addToCart, isSoldOut, openBag } = useShop();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, true, onClose);
  const [chosen, setChosen] = useState<Record<number, boolean>>({});
  const [quantity, setQuantity] = useState(1);
  const soldOut = isSoldOut(item);
  const maxQty = item.stock === null ? 20 : Math.max(Math.min(item.stock, 20), 1);
  const picked = item.options.filter((option) => chosen[option.id]);
  const optionPrice = picked.reduce((sum, option) => sum + option.priceCents, 0) / 100;
  const lineTotal = (item.price + optionPrice) * quantity;

  return (
    <div className="sheet-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-media">
          <img src={item.image} alt={`${item.name} from Philly on the Block`} style={item.imagePosition ? { objectPosition: item.imagePosition } : undefined} />
          <button className="icon-button sheet-close" type="button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="sheet-body">
          <span className="eyebrow">{item.category}{item.badge ? ` · ${item.badge}` : ""}</span>
          <h2 id="sheet-title" className="display-md">{item.name}</h2>
          <p className="sheet-desc">{item.description}</p>
          <p className="sheet-price">{money(item.price)}</p>

          {soldOut ? (
            <p className="form-error">Sold out right now — check back soon.</p>
          ) : (
            <>
              {item.options.length > 0 && (
                <fieldset className="field-group options">
                  <legend>Make it yours <em>(optional)</em></legend>
                  {item.options.map((option) => (
                    <label key={option.id} className={`option${chosen[option.id] ? " is-on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={chosen[option.id] === true}
                        onChange={() => setChosen((current) => ({ ...current, [option.id]: !current[option.id] }))}
                      />
                      <span>{option.name}</span>
                      <strong>{option.priceCents > 0 ? `+${money(option.priceCents / 100)}` : "Included"}</strong>
                    </label>
                  ))}
                </fieldset>
              )}
              <p className="field-note">Special requests? Add them in the kitchen notes at checkout.</p>
              <div className="sheet-actions">
                <div className="stepper stepper-lg">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(q - 1, 1))} disabled={quantity <= 1} aria-label="One fewer">−</button>
                  <span aria-live="polite" aria-label={`Quantity ${quantity}`}>{quantity}</span>
                  <button type="button" onClick={() => setQuantity((q) => Math.min(q + 1, maxQty))} disabled={quantity >= maxQty} aria-label="One more">+</button>
                </div>
                <button
                  className="btn btn-primary btn-grow"
                  type="button"
                  onClick={() => {
                    addToCart(item, picked.map((option) => option.name), optionPrice, quantity);
                    openBag();
                  }}
                >
                  Add to bag · {money(lineTotal)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
