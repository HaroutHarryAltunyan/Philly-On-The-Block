export type OrderLineInput = {
  id?: number;
  name?: string;
  priceCents?: number;
  optionPriceCents?: number;
  quantity?: number;
  options?: string[];
};

import { normalizePhone } from "./points";

export type OrderLine = {
  id: number | null;
  name: string;
  priceCents: number;
  optionPriceCents: number;
  quantity: number;
  options: string[];
};

export type OrderFees = {  serviceFeeCents: number;
  deliveryFeeCents: number;
  taxRatePercent: number;
};

export type CouponInfo = {
  type: "percent" | "fixed";
  amount: number;
  minSubtotalCents: number;
} | null;

export type ParsedOrder = {
  name: string;
  phone: string;
  phoneKey: string;
  email: string;
  address: string;
  destLat: string;
  destLng: string;
  fulfillment: "pickup" | "delivery";
  notes: string;
  couponCode: string;
  lines: OrderLine[];
  subtotalCents: number;
  serviceFeeCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  discountCents: number;
  pointsRedeemed: number;
  pointsDiscountCents: number;
  totalCents: number;
};

export const DEFAULT_ORDER_FEES: OrderFees = {
  serviceFeeCents: 150,
  deliveryFeeCents: 0,
  taxRatePercent: 8,
};

export type OrderTotals = {
  subtotalCents: number;
  serviceFeeCents: number;
  deliveryFeeCents: number;
  couponDiscountCents: number;
  pointsDiscountCents: number;
  discountCents: number;
  taxableCents: number;
  taxCents: number;
  totalCents: number;
};

// Single source of truth for order math. Checkout, the quote endpoint and
// the Stripe session all derive from this so the website total, the stored
// order total and the amount Stripe charges can never drift apart.
export function computeOrderTotals(input: {
  lines: OrderLine[];
  fulfillment: "pickup" | "delivery";
  fees?: Partial<OrderFees>;
  coupon?: CouponInfo;
  pointsDiscountCents?: number;
  deliveryFeeOverrideCents?: number;
}): OrderTotals {
  const fees: OrderFees = { ...DEFAULT_ORDER_FEES, ...input.fees };
  const subtotalCents = input.lines.reduce(
    (sum, line) => sum + (line.priceCents + line.optionPriceCents) * line.quantity,
    0,
  );
  const serviceFeeCents = subtotalCents > 0 ? Math.max(Math.round(fees.serviceFeeCents), 0) : 0;
  const deliveryFeeCents =
    input.fulfillment === "delivery" && subtotalCents > 0
      ? Math.max(Math.round(input.deliveryFeeOverrideCents ?? fees.deliveryFeeCents), 0)
      : 0;
  const couponDiscountCents = computeCouponDiscount(subtotalCents, input.coupon ?? null);
  const pointsDiscountCents = Math.min(
    Math.max(Math.round(Number(input.pointsDiscountCents) || 0), 0),
    Math.max(subtotalCents - couponDiscountCents, 0),
  );
  const discountCents = couponDiscountCents + pointsDiscountCents;
  const taxableCents = Math.max(subtotalCents - discountCents, 0);
  const taxCents = Math.round((taxableCents * fees.taxRatePercent) / 100);
  const totalCents = taxableCents + serviceFeeCents + deliveryFeeCents + taxCents;
  return {
    subtotalCents,
    serviceFeeCents,
    deliveryFeeCents,
    couponDiscountCents,
    pointsDiscountCents,
    discountCents,
    taxableCents,
    taxCents,
    totalCents,
  };
}

export function computeCouponDiscount(subtotalCents: number, coupon: CouponInfo): number {
  if (!coupon) return 0;
  if (subtotalCents < coupon.minSubtotalCents) return 0;
  if (coupon.type === "fixed") {
    return Math.min(coupon.amount, subtotalCents);
  }
  const percent = Math.min(Math.max(coupon.amount, 0), 100);
  return Math.min(Math.round((subtotalCents * percent) / 100), subtotalCents);
}

// Email is optional (used for the Stripe receipt). Normalize and drop anything
// that isn't plausibly an address so we never hand Stripe a malformed value.
function sanitizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase().slice(0, 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export function parseOrderPayload(
  payload: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    destLat?: string;
    destLng?: string;
    fulfillment?: string;
    notes?: string;
    couponCode?: string;
    deliveryFeeCents?: number;
    redeemPoints?: number;
    items?: OrderLineInput[];
  },
  options: {
    fees?: Partial<OrderFees>;
    coupon?: CouponInfo;
    pointsDiscountCents?: number;
    pointsRedeemedPoints?: number;
  } = {},
): ParsedOrder {
  const name = payload.name?.trim() ?? "";
  const phone = payload.phone?.trim() ?? "";
  const phoneKey = normalizePhone(phone);
  const email = sanitizeEmail(payload.email);
  const address = payload.address?.trim() ?? "";
  const destLat = parseCoordinate(payload.destLat, false);
  const destLng = parseCoordinate(payload.destLng, true);
  const fulfillment = payload.fulfillment;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const notes = (payload.notes?.trim() ?? "").slice(0, 500);
  const couponCode = (payload.couponCode?.trim() ?? "").toUpperCase().slice(0, 32);
  const coupon = couponCode ? options.coupon ?? null : null;

  if (!name || !phone) {
    throw new OrderValidationError("name and phone are required");
  }
  if (fulfillment !== "pickup" && fulfillment !== "delivery") {
    throw new OrderValidationError('fulfillment must be "pickup" or "delivery"');
  }
  if (fulfillment === "delivery" && !address) {
    throw new OrderValidationError("address is required for delivery");
  }
  if (items.length === 0) {
    throw new OrderValidationError("items must not be empty");
  }

  const lines = items.map((item) => {
    const priceCents = Math.round(Number(item.priceCents) || 0);
    const optionPriceCents = Math.round(Number(item.optionPriceCents) || 0);
    const quantity = Math.min(Math.max(Math.round(Number(item.quantity) || 1), 1), 99);
    return {
      id: typeof item.id === "number" ? item.id : null,
      name: item.name?.trim() || "Menu item",
      priceCents,
      optionPriceCents,
      quantity,
      options: Array.isArray(item.options) ? item.options : [],
    };
  });

  const totals = computeOrderTotals({
    lines,
    fulfillment,
    fees: options.fees,
    coupon,
    pointsDiscountCents: options.pointsDiscountCents,
    deliveryFeeOverrideCents: (payload as { deliveryFeeCents?: number }).deliveryFeeCents,
  });
  // The caller (computeOrderQuote) already caps redemption at maxRedeemable,
  // so only normalize here — deriving a cap from the cent value would silently
  // break if POINTS_TO_CENTS ever stops being 1.
  const pointsRedeemed =
    options.pointsRedeemedPoints !== undefined
      ? Math.max(Math.round(Number(options.pointsRedeemedPoints) || 0), 0)
      : totals.pointsDiscountCents;

  return {
    name,
    phone,
    phoneKey,
    email,
    address,
    destLat,
    destLng,
    fulfillment,
    notes,
    couponCode: coupon ? couponCode : "",
    lines,
    ...totals,
    pointsRedeemed,
  };
}

// Maps an order's lines to Stripe line items. The full discount is prorated
// across the item lines so that items (subtotal - discount) plus the fees
// line added by createCheckoutSession equals parsed.totalCents exactly —
// the amount Stripe charges is always identical to the order total.
export function buildStripeLineItems(parsed: ParsedOrder): Array<{ name: string; quantity: number; amountCents: number }> {
  const subtotalCents = parsed.lines.reduce(
    (sum, line) => sum + (line.priceCents + line.optionPriceCents) * line.quantity,
    0,
  );
  const discountCents = Math.min(parsed.discountCents, subtotalCents);

  const itemLines = parsed.lines.map((line) => ({
    name: line.options.length > 0 ? `${line.name} (${line.options.join(", ")})` : line.name,
    unitCents: line.priceCents + line.optionPriceCents,
    quantity: line.quantity,
    totalCents: (line.priceCents + line.optionPriceCents) * line.quantity,
  }));

  if (discountCents > 0 && subtotalCents > 0) {
    // First pass: each line absorbs the floor of its proportional share.
    let remaining = discountCents;
    for (const line of itemLines) {
      const share = Math.min(Math.floor((line.totalCents / subtotalCents) * discountCents), line.totalCents, remaining);
      line.totalCents -= share;
      remaining -= share;
    }
    // Second pass: flooring loses at most one cent per line, so a few cents
    // can be left unassigned. Hand them out to lines that still have value —
    // the total capacity is always enough (discount <= subtotal) — so the
    // discounted item total is exactly subtotal - discount. Dropping the
    // remainder would make Stripe charge more than the order total.
    for (const line of itemLines) {
      if (remaining <= 0) break;
      const share = Math.min(remaining, line.totalCents);
      line.totalCents -= share;
      remaining -= share;
    }
  }

  return itemLines
    // Fully discounted (or free) items bill nothing; a zero-amount line item
    // is unnecessary and some Stripe configs reject it.
    .filter((line) => line.totalCents > 0)
    .map((line) => {
      // When a line absorbed a discount its total may no longer divide evenly
      // by its quantity, so bill it as a single unit to keep the cents exact.
      const discounted = line.totalCents !== line.unitCents * line.quantity;
      return {
        name: line.name,
        quantity: discounted ? 1 : line.quantity,
        amountCents: discounted ? line.totalCents : line.unitCents,
      };
    });
}

export class OrderValidationError extends Error {}

function parseCoordinate(value: string | undefined, isLongitude: boolean): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return "";
  const bounds = isLongitude ? 180 : 90;
  if (Math.abs(number) > bounds) return "";
  return trimmed;
}