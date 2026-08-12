export type MenuItemOption = {
  id: number;
  name: string;
  priceCents: number;
};

export type MenuItem = {
  id: number;
  name: string;
  category: string;
  description: string;
  priceCents: number;
  badge: string;
  image: string;
  imagePosition: string;
  available: boolean;
  stock: number | null;
  options: MenuItemOption[];
  sortOrder: number;
};

export type Order = {
  id: number;
  orderNumber: string;
  name: string;
  phone: string;
  address: string;
  fulfillment: "pickup" | "delivery";
  items: OrderLine[];
  notes: string;
  subtotalCents: number;
  serviceFeeCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  discountCents: number;
  couponCode: string;
  totalCents: number;
  status: "new" | "preparing" | "ready" | "delivering" | "completed" | "cancelled";
  paymentStatus: "unpaid" | "paid" | "refunded";
  paymentMethod: string;
  paidAt: string | null;
  createdAt: string;
  driverId: number | null;
  destLat: string;
  destLng: string;
  driverLat: string;
  driverLng: string;
  driverUpdatedAt: string | null;
};

export type OrderLine = {
  id: number | null;
  name: string;
  priceCents: number;
  optionPriceCents: number;
  quantity: number;
  options: string[];
};

export type Reservation = {
  id: number;
  name: string;
  phone: string;
  email: string;
  eventType: string;
  partySize: number;
  dateTime: string;
  notes: string;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: string;
};

export type Coupon = {
  id: number;
  code: string;
  type: "percent" | "fixed";
  amount: number;
  minSubtotalCents: number;
  active: boolean;
  createdAt: string;
};

export type Stats = {
  todayOrders: number;
  revenueCents: number;
  activeOrders: number;
  pendingReservations: number;
  recentOrders: Order[];
  upcomingReservations: Reservation[];
};

export const ORDER_STATUSES = ["new", "preparing", "ready", "delivering", "completed", "cancelled"] as const;
export const RESERVATION_STATUSES = ["pending", "confirmed", "cancelled"] as const;

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const ORDER_STATUS_LABELS: Record<(typeof ORDER_STATUSES)[number], string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  delivering: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RESERVATION_STATUS_LABELS: Record<(typeof RESERVATION_STATUSES)[number], string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}
