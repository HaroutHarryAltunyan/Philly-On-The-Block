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
  totalCents: number;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.customerEmail || undefined,
    line_items: [
      ...params.lines.map((line) => ({
        quantity: line.quantity,
        price_data: {
          currency: "usd",
          unit_amount: line.amountCents,
          product_data: { name: line.name },
        },
      })),
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: params.totalCents,
          product_data: { name: `Philly on the Block order ${params.orderNumber} (tax + service)` },
        },
      },
    ],
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
