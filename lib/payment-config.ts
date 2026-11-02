// Master switch for online card payments (Stripe Checkout). While false, the
// customer site offers cash-in-person only and the checkout API refuses to
// start a Stripe session even if STRIPE_SECRET_KEY is set. Flip to true to
// bring card payments back.
export const CARD_PAYMENTS_ENABLED = false;
