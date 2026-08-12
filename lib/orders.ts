export type OrderLineInput = {
  id?: number;
  name?: string;
  priceCents?: number;
  optionPriceCents?: number;
  quantity?: number;
  options?: string[];
};

export type OrderLine = {
  id: number | null;
  name: string;
  priceCents: number;
  optionPriceCents: number;
  quantity: number;
  options: string[];
};

export type OrderFees = {
  serviceFeeCents: number;
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
  totalCents: number;
};

export const DEFAULT_ORDER_FEES: OrderFees = {
  serviceFeeCents: 150,
  deliveryFeeCents: 0,
  taxRatePercent: 8,
};

export function computeCouponDiscount(subtotalCents: number, coupon: CouponInfo): number {
  if (!coupon) return 0;
  if (subtotalCents < coupon.minSubtotalCents) return 0;
  if (coupon.type === "fixed") {
    return Math.min(coupon.amount, subtotalCents);
  }
  const percent = Math.min(Math.max(coupon.amount, 0), 100);
  return Math.min(Math.round((subtotalCents * percent) / 100), subtotalCents);
}

export function parseOrderPayload(
  payload: {
    name?: string;
    phone?: string;
    address?: string;
    destLat?: string;
    destLng?: string;
    fulfillment?: string;
    notes?: string;
    couponCode?: string;
    deliveryFeeCents?: number;
    items?: OrderLineInput[];
  },
  options: {
    fees?: Partial<OrderFees>;
    coupon?: CouponInfo;
  } = {},
): ParsedOrder {
  const name = payload.name?.trim() ?? "";
  const phone = payload.phone?.trim() ?? "";
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

  const subtotalCents = lines.reduce(
    (sum, line) => sum + (line.priceCents + line.optionPriceCents) * line.quantity,
    0,
  );
  const fees: OrderFees = { ...DEFAULT_ORDER_FEES, ...options.fees };
  const serviceFeeCents = subtotalCents > 0 ? Math.max(Math.round(fees.serviceFeeCents), 0) : 0;
  const deliveryFeeCents =
    fulfillment === "delivery" && subtotalCents > 0
      ? Math.max(Math.round((payload as { deliveryFeeCents?: number }).deliveryFeeCents ?? fees.deliveryFeeCents), 0)
      : 0;
  const discountCents = computeCouponDiscount(subtotalCents, coupon);
  const taxableCents = Math.max(subtotalCents - discountCents, 0);
  const taxCents = Math.round((taxableCents * fees.taxRatePercent) / 100);
  const totalCents = taxableCents + serviceFeeCents + deliveryFeeCents + taxCents;

  return {
    name,
    phone,
    address,
    destLat,
    destLng,
    fulfillment,
    notes,
    couponCode: coupon ? couponCode : "",
    lines,
    subtotalCents,
    serviceFeeCents,
    deliveryFeeCents,
    taxCents,
    discountCents,
    totalCents,
  };
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