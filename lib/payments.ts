import Stripe from "stripe";
import { env } from "cloudflare:workers";

export function getStripe(): Stripe | null {
  const secretKey = (env as Record<string, string | undefined>).STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

export function isStripeConfigured(): boolean {
  return Boolean((env as Record<string, string | undefined>).STRIPE_SECRET_KEY);
}

export async function createCheckoutSession(params: {
  orderId: number;
  orderNumber: string;
  lines: Array<{ name: string; quantity: number; amountCents: number }>;
  // Service fee + delivery fee + tax only. The item lines already carry the
  // (discounted) food total, so session total = items + feesLineCents must
  // equal the stored order total exactly.
  feesLineCents: number;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const lineItems = params.lines.map((line) => ({
    quantity: line.quantity,
    price_data: {
      currency: "usd",
      unit_amount: line.amountCents,
      product_data: { name: line.name },
    },
  }));
  if (params.feesLineCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: params.feesLineCents,
        product_data: { name: `Philly on the Block order ${params.orderNumber} (tax + service)` },
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.customerEmail || undefined,
    line_items: lineItems,
    metadata: { orderId: String(params.orderId), orderNumber: params.orderNumber },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return { url: session.url, sessionId: session.id };
}

export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  return stripe.checkout.sessions.retrieve(sessionId);
}

export async function verifyWebhookSignature(
  body: string,
  signature: string,
): Promise<Stripe.Event | null> {
  const stripe = getStripe();
  const secret = (env as Record<string, string | undefined>).STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return null;
  return stripe.webhooks.constructEventAsync(body, signature, secret);
}
