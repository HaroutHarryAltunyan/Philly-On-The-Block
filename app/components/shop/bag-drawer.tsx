"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { trackPurchase } from "../../../lib/fbq";
import { CARD_PAYMENTS_ENABLED } from "../../../lib/payment-config";
import { useShop } from "./shop-context";
import { useDialog } from "./use-dialog";

const money = (value: number) => `$${value.toFixed(2)}`;

function buildFullAddress(line1: string, line2: string, city: string, state: string, zip: string) {
  const lines = [line1.trim(), line2.trim()].filter(Boolean);
  const region = [city.trim(), state.trim(), zip.trim()].filter(Boolean);
  const address = lines.join(", ");
  return region.length > 0 ? `${address}${address ? ", " : ""}${region.join(" ")}` : address;
}

type CheckoutQuote = {
  subtotalCents: number;
  serviceFeeCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  couponDiscountCents: number;
  pointsDiscountCents: number;
  totalCents: number;
  maxRedeemablePoints: number;
};

type Step = "cart" | "checkout" | "success";

export default function BagDrawer() {
  const shop = useShop();
  const { cart, fulfillment, setFulfillment, bagOpen, closeBag, fees, menu } = shop;
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, bagOpen, closeBag);

  const [step, setStep] = useState<Step>("cart");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">(CARD_PAYMENTS_ENABLED ? "card" : "cash");
  const [cashTotal, setCashTotal] = useState<number | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponState, setCouponState] = useState<"idle" | "applying" | "applied" | "invalid">("idle");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pointsBalance, setPointsBalance] = useState(0);
  const [pointsRedeem, setPointsRedeem] = useState(0);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsState, setPointsState] = useState<"idle" | "loaded" | "error">("idle");
  const pointsFetchSeqRef = useRef(0);
  const [orderNumber, setOrderNumber] = useState("");
  const [orderError, setOrderError] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);
  const [deliveryFeeCents, setDeliveryFeeCents] = useState(0);
  const [deliveryDistance, setDeliveryDistance] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const quotedAddressRef = useRef("");
  const quoteSeqRef = useRef(0);
  const [deliveryAddress, setDeliveryAddress] = useState({ address: "", address2: "", city: "", state: "CA", zip: "" });
  const [successFulfillment, setSuccessFulfillment] = useState(fulfillment);
  const prefilledRef = useRef(false);

  const itemCount = shop.itemCount;
  const subtotal = cart.reduce((sum, line) => sum + (line.item.price + line.optionPrice) * line.quantity, 0);

  // Local estimate; replaced by the server quote (the same pricing code
  // checkout runs) as soon as it arrives.
  const serviceFee = subtotal > 0 ? fees.serviceFeeCents / 100 : 0;
  const deliveryFee =
    fulfillment === "Delivery" && subtotal > 0 ? (deliveryFeeCents > 0 ? deliveryFeeCents : fees.deliveryFeeCents) / 100 : 0;
  const pointsDiscountCents = Math.min(pointsRedeem, Math.max(Math.round((subtotal - couponDiscount) * 100), 0));
  const taxable = Math.max(subtotal - couponDiscount - pointsDiscountCents / 100, 0);
  const tax = taxable * (fees.taxRatePercent / 100);
  const total = taxable + serviceFee + deliveryFee + tax;
  const maxRedeemablePoints = Math.min(pointsBalance, Math.max(Math.round((subtotal - couponDiscount) * 100), 0));

  const displaySubtotal = quote ? quote.subtotalCents / 100 : subtotal;
  const displayCouponDiscount = quote ? quote.couponDiscountCents / 100 : couponDiscount;
  const displayPointsRedeemed = quote ? quote.pointsDiscountCents : pointsDiscountCents;
  const displayDeliveryFee = quote ? quote.deliveryFeeCents / 100 : deliveryFee;
  const displayTax = quote ? quote.taxCents / 100 : tax;
  const displayService = quote ? quote.serviceFeeCents / 100 : serviceFee;
  const displayTotal = quote ? quote.totalCents / 100 : total;
  const effectiveMaxRedeemable = quote ? quote.maxRedeemablePoints : maxRedeemablePoints;

  const cartWarnings: Record<string, "removed" | "soldout"> = {};
  for (const line of cart) {
    const fresh = menu.find((item) => item.id === line.item.id);
    if (!fresh) cartWarnings[line.lineId] = "removed";
    else if (shop.isSoldOut(fresh)) cartWarnings[line.lineId] = "soldout";
  }
  const cartBlocked = Object.keys(cartWarnings).length > 0;

  // Returning from hosted card checkout (only reachable if card payments are
  // switched back on): confirm the session, then show the receipt.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const cartParam = params.get("cart") === "1" || params.get("canceled") === "1";
    if (cartParam) {
      window.history.replaceState({}, "", window.location.pathname);
      queueMicrotask(shop.openBag);
      return;
    }
    if (!sessionId) return;
    fetch(`/api/checkout/success?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (response) => {
        const body = (await response.json()) as {
          paid?: boolean;
          order?: { orderNumber: string; totalCents: number; fulfillment: string };
          error?: string;
        };
        if (!response.ok || !body.paid || !body.order) throw new Error(body.error ?? "Payment wasn’t completed.");
        trackPurchase({
          value: Number((body.order.totalCents / 100).toFixed(2)),
          currency: "USD",
          content_type: "product",
          content_ids: [],
          num_items: 0,
          order_number: body.order.orderNumber,
        });
        shop.clearCart();
        setSuccessFulfillment(body.order.fulfillment === "delivery" ? "Delivery" : "Pickup");
        setOrderNumber(body.order.orderNumber);
        setStep("success");
        shop.openBag();
      })
      .catch((error: unknown) => {
        setOrderError(error instanceof Error ? error.message : "Payment wasn’t completed.");
        shop.openBag();
      })
      .finally(() => window.history.replaceState({}, "", window.location.pathname));
    // Runs once on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed-in customers get their saved details filled in once.
  useEffect(() => {
    if (step !== "checkout" || !shop.signedIn || prefilledRef.current) return;
    prefilledRef.current = true;
    fetch("/api/account/me")
      .then((response) => (response.ok ? (response.json() as Promise<{ customer?: { name: string; phone: string; email: string } }>) : null))
      .then((data) => {
        if (!data?.customer) return;
        setName((current) => current || data.customer!.name);
        setPhone((current) => current || data.customer!.phone);
        setEmail((current) => current || data.customer!.email);
      })
      .catch(() => undefined);
  }, [step, shop.signedIn]);

  function applyCoupon() {
    const code = couponCode.trim();
    if (!code || couponState === "applying") return;
    setCouponState("applying");
    setOrderError("");
    fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotalCents: Math.round(subtotal * 100) }),
    })
      .then(async (response) => {
        const body = (await response.json()) as { valid?: boolean; discountCents?: number; error?: string };
        if (!response.ok || !body.valid || body.discountCents === undefined) throw new Error(body.error ?? "That code doesn’t apply.");
        setCouponDiscount(body.discountCents / 100);
        setCouponState("applied");
      })
      .catch((err: unknown) => {
        setCouponDiscount(0);
        setCouponState("invalid");
        setOrderError(err instanceof Error ? err.message : "That code doesn’t apply.");
      });
  }

  function removeCoupon() {
    setCouponCode("");
    setCouponDiscount(0);
    setCouponState("idle");
    setOrderError("");
  }

  useEffect(() => {
    if (couponState === "applied" && cart.length > 0) queueMicrotask(applyCoupon);
    // Re-validate when the subtotal changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, cart.length]);

  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (step !== "checkout" || digits.length < 10) {
      const timer = window.setTimeout(() => {
        pointsFetchSeqRef.current += 1;
        setPointsLoading(false);
        setPointsBalance(0);
        setPointsState("idle");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const seq = ++pointsFetchSeqRef.current;
    const timer = window.setTimeout(() => {
      setPointsLoading(true);
      fetch(`/api/points/balance?phone=${encodeURIComponent(phone)}`)
        .then(async (res) => {
          const body = (await res.json()) as { balance?: number; error?: string };
          if (seq !== pointsFetchSeqRef.current) return;
          if (!res.ok) throw new Error(body.error ?? "Couldn’t load points.");
          const balance = Math.max(Number(body.balance) || 0, 0);
          setPointsBalance(balance);
          setPointsRedeem((current) => Math.min(current, balance));
          setPointsState("loaded");
        })
        .catch(() => {
          if (seq !== pointsFetchSeqRef.current) return;
          setPointsState("error");
          setPointsBalance(0);
          setPointsRedeem(0);
        })
        .finally(() => {
          if (seq === pointsFetchSeqRef.current) setPointsLoading(false);
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [phone, step]);

  useEffect(() => {
    const shouldQuote = fulfillment === "Delivery" && step === "checkout" && deliveryAddress.address;
    const timer = setTimeout(async () => {
      if (!shouldQuote) {
        setDeliveryFeeCents(0);
        setDeliveryDistance(null);
        quotedAddressRef.current = "";
        return;
      }
      const fullAddress = buildFullAddress(deliveryAddress.address, deliveryAddress.address2, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zip);
      if (!fullAddress || fullAddress === quotedAddressRef.current) return;
      const seq = ++quoteSeqRef.current;
      setFeeLoading(true);
      try {
        const res = await fetch("/api/delivery-fee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: fullAddress }),
        });
        // Keep the last good quote when a re-check fails; checkout re-prices
        // on the server anyway.
        if (seq !== quoteSeqRef.current || !res.ok) return;
        const data = (await res.json()) as { feeCents?: number; miles?: number | null };
        if (seq !== quoteSeqRef.current) return;
        quotedAddressRef.current = fullAddress;
        setDeliveryFeeCents(data.feeCents ?? 0);
        setDeliveryDistance(data.miles ?? null);
      } catch {
        // keep the last good quote
      } finally {
        if (seq === quoteSeqRef.current) setFeeLoading(false);
      }
    }, shouldQuote ? 800 : 0);
    return () => clearTimeout(timer);
  }, [deliveryAddress, fulfillment, step]);

  const priceQuoteSeqRef = useRef(0);
  useEffect(() => {
    if (step === "success") return;
    const seq = ++priceQuoteSeqRef.current;
    if (cart.length === 0) {
      const clear = window.setTimeout(() => setQuote(null), 0);
      return () => window.clearTimeout(clear);
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/checkout/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: cart.map((line) => ({ id: line.item.id, quantity: line.quantity, options: line.options })),
              phone,
              fulfillment: fulfillment === "Delivery" ? "delivery" : "pickup",
              address:
                fulfillment === "Delivery"
                  ? buildFullAddress(deliveryAddress.address, deliveryAddress.address2, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zip)
                  : "",
              couponCode: couponState === "applied" ? couponCode : "",
              redeemPoints: pointsRedeem,
            }),
          });
          const body = (await response.json()) as CheckoutQuote & { error?: string };
          if (!response.ok) throw new Error(body.error ?? "Couldn’t price the order.");
          if (seq === priceQuoteSeqRef.current) setQuote(body);
        } catch {
          if (seq === priceQuoteSeqRef.current) setQuote(null);
        }
      })();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [step, cart, phone, fulfillment, deliveryAddress, couponCode, couponState, pointsRedeem]);

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (placingOrder) return;
    const formData = new FormData(event.currentTarget);
    const notes = String(formData.get("notes") ?? "").trim();
    const address = buildFullAddress(deliveryAddress.address, deliveryAddress.address2, deliveryAddress.city, deliveryAddress.state, deliveryAddress.zip);

    setOrderError("");
    setPlacingOrder(true);
    fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim(),
        email,
        address: fulfillment === "Delivery" ? address : "",
        destLat: "",
        destLng: "",
        fulfillment: fulfillment === "Delivery" ? "delivery" : "pickup",
        paymentMethod,
        notes,
        couponCode: couponState === "applied" ? couponCode : "",
        redeemPoints: pointsRedeem,
        deliveryFeeCents,
        items: cart.map((line) => ({
          id: line.item.id,
          name: line.item.name,
          priceCents: Math.round(line.item.price * 100),
          optionPriceCents: Math.round(line.optionPrice * 100),
          quantity: line.quantity,
          options: line.options,
        })),
      }),
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          mode?: "stripe" | "demo" | "cash";
          url?: string;
          order?: { orderNumber: string; totalCents?: number };
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Couldn’t place the order. Try again.");
        if (body.mode === "stripe" && body.url) {
          // The bag stays in local storage, so a cancelled card payment
          // comes back to the same bag.
          window.location.href = body.url;
          return;
        }
        if (body.mode === "cash") {
          setCashTotal(typeof body.order?.totalCents === "number" ? body.order.totalCents : Math.round(displayTotal * 100));
        }
        trackPurchase({
          value: Number(displayTotal.toFixed(2)),
          currency: "USD",
          content_type: "product",
          content_ids: cart.map((line) => String(line.item.id)),
          num_items: itemCount,
          order_number: body.order?.orderNumber ?? "",
        });
        setOrderNumber(body.order?.orderNumber ?? "");
        setSuccessFulfillment(fulfillment);
        shop.clearCart();
        setStep("success");
        setPlacingOrder(false);
      })
      .catch((error: unknown) => {
        setOrderError(error instanceof Error ? error.message : "Couldn’t place the order. Try again.");
        setPlacingOrder(false);
      });
  }

  function resetOrder() {
    setStep("cart");
    closeBag();
    setOrderNumber("");
    setOrderError("");
    setPaymentMethod(CARD_PAYMENTS_ENABLED ? "card" : "cash");
    setCashTotal(null);
    setQuote(null);
    removeCoupon();
    setPointsBalance(0);
    setPointsRedeem(0);
    setPointsState("idle");
    setDeliveryFeeCents(0);
    setDeliveryDistance(null);
    quotedAddressRef.current = "";
    quoteSeqRef.current = 0;
    setDeliveryAddress({ address: "", address2: "", city: "", state: "CA", zip: "" });
  }

  const totals = (
    <dl className="bag-totals">
      <div><dt>Subtotal</dt><dd>{money(displaySubtotal)}</dd></div>
      {displayCouponDiscount > 0 && (
        <div className="is-discount"><dt>Coupon {couponCode.toUpperCase()}</dt><dd>−{money(displayCouponDiscount)}</dd></div>
      )}
      {displayPointsRedeemed > 0 && (
        <div className="is-discount"><dt>Points (−{displayPointsRedeemed.toLocaleString("en-US")})</dt><dd>−{money(displayPointsRedeemed / 100)}</dd></div>
      )}
      {fulfillment === "Delivery" && (
        <div><dt>Delivery fee</dt><dd>{displayDeliveryFee > 0 ? money(displayDeliveryFee) : step === "checkout" ? "Enter address" : "At checkout"}</dd></div>
      )}
      <div><dt>Tax</dt><dd>{money(displayTax)}</dd></div>
      <div><dt>Service fee</dt><dd>{money(displayService)}</dd></div>
      <div className="is-total"><dt>Total</dt><dd>{money(displayTotal)}</dd></div>
    </dl>
  );

  return (
    <>
      <div className={`bag-scrim${bagOpen ? " is-open" : ""}`} aria-hidden="true" onClick={closeBag} />
      <div
        ref={panelRef}
        className={`bag${bagOpen ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bag-title"
        aria-hidden={!bagOpen}
        inert={!bagOpen}
      >
        <header className="bag-head">
          <div>
            <span className="eyebrow">{step === "success" ? "Order placed" : step === "checkout" ? "Final details" : `Your ${fulfillment.toLowerCase()}`}</span>
            <h2 id="bag-title">{step === "success" ? "You’re on the board." : step === "checkout" ? "Almost yours." : "The bag"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={closeBag} aria-label="Close bag">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </button>
        </header>

        {step === "success" ? (
          <div className="bag-body bag-success">
            <div className="success-mark" aria-hidden="true">✓</div>
            <p className="success-number"><span>Order</span><strong>{orderNumber}</strong></p>
            <p>Your {successFulfillment.toLowerCase()} window is approximately 20–25 minutes.</p>
            {cashTotal !== null && (
              <p className="success-pay">
                Please pay <strong>{money(cashTotal / 100)}</strong> (cash or card) in person at {successFulfillment === "Delivery" ? "delivery" : "pickup"}.
              </p>
            )}
            <p className="muted">Save your order number. You’ll need it with your phone number to track the order.</p>
            <div className="stack-actions">
              <a className="btn btn-primary" href={`/track?number=${encodeURIComponent(orderNumber)}`}>Track this order</a>
              <button type="button" className="btn btn-ghost" onClick={resetOrder}>Start another order</button>
            </div>
          </div>
        ) : step === "checkout" ? (
          <form className="bag-body checkout" onSubmit={submitOrder}>
            <button className="text-button" type="button" onClick={() => setStep("cart")}>← Back to bag</button>
            <div className="segmented" role="group" aria-label="Pickup or delivery">
              {(["Pickup", "Delivery"] as const).map((option) => (
                <button key={option} type="button" aria-pressed={fulfillment === option} onClick={() => setFulfillment(option)}>
                  {option}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Name</span>
              <input name="name" autoComplete="name" placeholder="Your name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Mobile number</span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="(818) 555-0123"
                required
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  if (pointsState !== "idle") setPointsState("idle");
                }}
              />
            </label>
            <label className="field">
              <span>Email for receipt <em>(optional)</em></span>
              <input name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>

            {fulfillment === "Delivery" && (
              <fieldset className="field-group">
                <legend>Delivery address</legend>
                <label className="field">
                  <span>Street address</span>
                  <input name="address" autoComplete="address-line1" placeholder="123 N Vine St" required value={deliveryAddress.address} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, address: e.target.value }))} />
                </label>
                <label className="field">
                  <span>Apt / suite <em>(optional)</em></span>
                  <input name="address2" autoComplete="address-line2" placeholder="Apt 4B" value={deliveryAddress.address2} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, address2: e.target.value }))} />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span>City</span>
                    <input name="city" autoComplete="address-level2" placeholder="Burbank" required value={deliveryAddress.city} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, city: e.target.value }))} />
                  </label>
                  <label className="field field-narrow">
                    <span>State</span>
                    <input name="state" autoComplete="address-level1" required value={deliveryAddress.state} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, state: e.target.value }))} />
                  </label>
                  <label className="field field-narrow">
                    <span>ZIP</span>
                    <input name="zip" autoComplete="postal-code" inputMode="numeric" placeholder="91505" required value={deliveryAddress.zip} onChange={(e) => setDeliveryAddress((prev) => ({ ...prev, zip: e.target.value }))} />
                  </label>
                </div>
                <p className="field-note" aria-live="polite">
                  {feeLoading
                    ? "Calculating delivery fee…"
                    : deliveryDistance !== null && deliveryFeeCents > 0
                      ? `${deliveryDistance} mi from the truck · delivery fee ${money(deliveryFeeCents / 100)}`
                      : ""}
                </p>
              </fieldset>
            )}

            <fieldset className="field-group">
              <legend>Payment</legend>
              {CARD_PAYMENTS_ENABLED ? (
                <div className="segmented">
                  {([["card", "Pay by card"], ["cash", "Pay in person"]] as const).map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={paymentMethod === value} onClick={() => setPaymentMethod(value)}>
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="pay-note">Pay in person — cash or card — at {fulfillment === "Delivery" ? "delivery" : "pickup"}.</p>
              )}
            </fieldset>

            <div aria-live="polite">
              {pointsLoading ? (
                <p className="field-note">Checking your points…</p>
              ) : pointsState === "error" ? (
                <p className="field-note">Couldn’t load points for this number.</p>
              ) : pointsState === "loaded" && pointsBalance > 0 ? (
                <div className="points-box">
                  <p>
                    You have <strong>{pointsBalance.toLocaleString("en-US")} points</strong> (≈ {money(pointsBalance / 100)})
                  </p>
                  <label className="field">
                    <span>Use points (100 = $1)</span>
                    <div className="inline-input">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={effectiveMaxRedeemable}
                        step={100}
                        value={Math.min(pointsRedeem, effectiveMaxRedeemable)}
                        onChange={(event) =>
                          setPointsRedeem(Math.min(Math.max(Math.round(Number(event.target.value) || 0), 0), effectiveMaxRedeemable))
                        }
                      />
                      <button type="button" className="btn btn-small" onClick={() => setPointsRedeem(effectiveMaxRedeemable)}>Use max</button>
                    </div>
                  </label>
                </div>
              ) : pointsState === "loaded" ? (
                <p className="field-note">No points on this number yet. This order starts earning.</p>
              ) : null}
            </div>

            <label className="field">
              <span>Notes for the kitchen <em>(optional)</em></span>
              <textarea name="notes" rows={2} maxLength={500} placeholder="No onions on the OTB, extra OTB Tang…" />
            </label>

            {couponState === "applied" && couponDiscount > 0 ? (
              <div className="coupon-applied" role="status">
                <span><strong>{couponCode.toUpperCase()}</strong> saves {money(couponDiscount)}</span>
                <button type="button" className="text-button" onClick={removeCoupon}>Remove</button>
              </div>
            ) : (
              <div className="inline-input">
                <input
                  value={couponCode}
                  onChange={(event) => {
                    setCouponCode(event.target.value.toUpperCase());
                    if (couponState === "invalid") setCouponState("idle");
                  }}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                  maxLength={32}
                />
                <button type="button" className="btn btn-small" disabled={couponState === "applying" || couponCode.trim() === ""} onClick={applyCoupon}>
                  {couponState === "applying" ? "Checking…" : "Apply"}
                </button>
              </div>
            )}

            {totals}
            {orderError && <p className="form-error" role="alert">{orderError}</p>}
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={placingOrder || cart.length === 0 || cartBlocked || (fulfillment === "Delivery" && feeLoading)}
            >
              {placingOrder
                ? "Placing order…"
                : fulfillment === "Delivery" && feeLoading
                  ? "Calculating delivery fee…"
                  : `Place order · ${money(displayTotal)}`}
            </button>
          </form>
        ) : (
          <div className="bag-body">
            <div className="segmented" role="group" aria-label="Pickup or delivery">
              {(["Pickup", "Delivery"] as const).map((option) => (
                <button key={option} type="button" aria-pressed={fulfillment === option} onClick={() => setFulfillment(option)}>
                  {option}
                </button>
              ))}
            </div>
            {cart.length === 0 ? (
              <div className="bag-empty">
                <p className="display-sm">Your bag is hungry.</p>
                <p className="muted">Add a sandwich and we’ll fire up the griddle.</p>
                <a className="btn btn-primary" href="/menu" onClick={closeBag}>Browse the menu</a>
              </div>
            ) : (
              <ul className="bag-lines">
                {cart.map((line) => (
                  <li className="bag-line" key={line.lineId}>
                    <img src={line.item.image} alt="" style={line.item.imagePosition ? { objectPosition: line.item.imagePosition } : undefined} />
                    <div className="bag-line-info">
                      <div className="bag-line-top">
                        <strong>{line.item.name}</strong>
                        <span>{money((line.item.price + line.optionPrice) * line.quantity)}</span>
                      </div>
                      {line.options.length > 0 && <small>{line.options.join(" · ")}</small>}
                      <div className="bag-line-actions">
                        <div className="stepper">
                          <button type="button" onClick={() => shop.updateQuantity(line.lineId, -1)} aria-label={`Remove one ${line.item.name}`}>−</button>
                          <span aria-live="polite" aria-label={`${line.quantity} in bag`}>{line.quantity}</span>
                          <button type="button" onClick={() => shop.updateQuantity(line.lineId, 1)} aria-label={`Add one ${line.item.name}`}>+</button>
                        </div>
                        <button type="button" className="text-button" onClick={() => shop.removeLine(line.lineId)}>Remove</button>
                      </div>
                      {cartWarnings[line.lineId] === "soldout" && <small className="form-error">Just sold out — remove it to check out.</small>}
                      {cartWarnings[line.lineId] === "removed" && <small className="form-error">No longer on the menu — remove it to check out.</small>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {cart.length > 0 && (
              <>
                {totals}
                {orderError && <p className="form-error" role="alert">{orderError}</p>}
                <button className="btn btn-primary btn-block" type="button" disabled={cartBlocked} onClick={() => setStep("checkout")}>
                  {cartBlocked ? "Check your bag for sold-out items" : "Checkout →"}
                </button>
                <p className="field-note center">Ready in approximately 20–25 minutes · pay in person</p>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
