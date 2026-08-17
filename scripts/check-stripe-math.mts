import { buildStripeLineItems, computeOrderTotals, type OrderLine } from "../lib/orders";

function line(name: string, priceCents: number, quantity: number, optionPriceCents = 0): OrderLine {
  return { id: null, name, priceCents, optionPriceCents, quantity, options: [] };
}

// Mirrors createCheckoutSession: session total = item lines + fees line.
function sessionTotalCents(parsedTotals: {
  subtotalCents: number; serviceFeeCents: number; deliveryFeeCents: number; taxCents: number;
  discountCents: number; totalCents: number; lines: OrderLine[];
}): number {
  const parsed = { ...parsedTotals, name: "", phone: "", phoneKey: "", address: "", destLat: "", destLng: "", fulfillment: "pickup" as const, notes: "", couponCode: "", pointsRedeemed: 0, pointsDiscountCents: 0 };
  const items = buildStripeLineItems(parsed);
  const feesLineCents = parsedTotals.serviceFeeCents + parsedTotals.deliveryFeeCents + parsedTotals.taxCents;
  const itemsTotal = items.reduce((sum, l) => sum + l.amountCents * l.quantity, 0);
  return itemsTotal + (feesLineCents > 0 ? feesLineCents : 0);
}

let failures = 0;
function check(label: string, input: Parameters<typeof computeOrderTotals>[0], expectedTotalCents?: number) {
  const totals = computeOrderTotals(input);
  const session = sessionTotalCents({ ...totals, lines: input.lines });
  const ok = session === totals.totalCents && (expectedTotalCents === undefined || totals.totalCents === expectedTotalCents);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}: order=${totals.totalCents}¢ session=${session}¢` +
    (expectedTotalCents !== undefined ? ` expected=${expectedTotalCents}¢` : "") +
    (ok ? "" : "  <-- MISMATCH"),
  );
}

const FEES_8 = { serviceFeeCents: 150, deliveryFeeCents: 0, taxRatePercent: 8 };
const FEES_1025 = { serviceFeeCents: 150, deliveryFeeCents: 0, taxRatePercent: 10.25 };

// 1. Simple pickup, default fees
check("simple pickup @8%", { lines: [line("Philly OTB", 2199, 1)], fulfillment: "pickup", fees: FEES_8 });

// 2. Half-cent tax case at 10.25%: taxable $2.00 -> tax = round(20.5) = 21¢
check("taxable $2.00 @10.25%", { lines: [line("Fries", 200, 1)], fulfillment: "pickup", fees: FEES_1025 }, 371);

// 3. Delivery with fee + 10.25%
check("delivery @10.25%", { lines: [line("Philly OTB", 2199, 2)], fulfillment: "delivery", fees: { ...FEES_1025 }, deliveryFeeOverrideCents: 900 });

// 4. Percent coupon across multiple lines (proration)
check("10% coupon, 3 lines @8%", {
  lines: [line("Philly OTB", 2199, 1), line("Fries", 550, 2), line("Melt", 1599, 1)],
  fulfillment: "pickup", fees: FEES_8, coupon: { type: "percent", amount: 10, minSubtotalCents: 0 },
});

// 5. Fixed coupon larger than the fees line (discount > service+tax)
check("fixed $5 coupon > fees @8%", {
  lines: [line("Philly OTB", 2199, 1)],
  fulfillment: "pickup", fees: FEES_8, coupon: { type: "fixed", amount: 500, minSubtotalCents: 0 },
});

// 6. Points discount (1pt = 1¢)
check("points 200 @8%", { lines: [line("Philly OTB", 2199, 1)], fulfillment: "pickup", fees: FEES_8, pointsDiscountCents: 200 });

// 7. Coupon + points combined
check("coupon + points @10.25%", {
  lines: [line("Philly OTB", 2199, 1), line("Fries", 550, 1)],
  fulfillment: "pickup", fees: FEES_1025,
  coupon: { type: "percent", amount: 15, minSubtotalCents: 0 }, pointsDiscountCents: 100,
});

// 8. Odd discount that doesn't divide evenly across lines
check("3¢ coupon, uneven split @8%", {
  lines: [line("A", 100, 1), line("B", 333, 1)],
  fulfillment: "pickup", fees: FEES_8, coupon: { type: "fixed", amount: 3, minSubtotalCents: 0 },
});

// 9. Zero-fee edge (no service fee, no tax) -> fees line omitted
check("zero fees", { lines: [line("A", 1000, 1)], fulfillment: "pickup", fees: { serviceFeeCents: 0, deliveryFeeCents: 0, taxRatePercent: 0 } }, 1000);

// 10. Large fixed coupon near the subtotal with uneven lines: floor rounding
// of each line's proportional share can leave cents that no single last line
// can absorb — they must be redistributed, never dropped (dropping them makes
// the session charge more than the order total).
check("fixed $29.97 coupon, uneven 3 lines @8%", {
  lines: [line("A", 1000, 1), line("B", 1000, 1), line("C", 998, 1)],
  fulfillment: "pickup", fees: FEES_8, coupon: { type: "fixed", amount: 2997, minSubtotalCents: 0 },
});

// 10b. Coupon covering the whole order: every item line bills zero and must
// be dropped from the session (only the fees line remains).
check("coupon covers full order @8%", {
  lines: [line("A", 500, 1), line("B", 2000, 1)],
  fulfillment: "pickup", fees: FEES_8, coupon: { type: "fixed", amount: 2500, minSubtotalCents: 0 },
});

// 11. Sweep: every subtotal from $0.01 to $250.00 at 10.25% must match
let sweepFail = 0;
for (let cents = 1; cents <= 25000; cents++) {
  const totals = computeOrderTotals({ lines: [line("X", cents, 1)], fulfillment: "pickup", fees: FEES_1025 });
  const session = sessionTotalCents({ ...totals, lines: [line("X", cents, 1)] });
  if (session !== totals.totalCents) { sweepFail++; if (sweepFail < 4) console.log(`  sweep mismatch at subtotal=${cents}¢: order=${totals.totalCents} session=${session}`); }
}
console.log(sweepFail === 0 ? "PASS sweep $0.01–$250.00 @10.25% (25,000 subtotals)" : `FAIL sweep: ${sweepFail} mismatches`);
if (sweepFail > 0) failures++;

// 12. Sweep with a 7% coupon at 10.25%
let sweepFail2 = 0;
for (let cents = 1; cents <= 25000; cents += 7) {
  const totals = computeOrderTotals({ lines: [line("X", cents, 1), line("Y", 550, 2)], fulfillment: "pickup", fees: FEES_1025, coupon: { type: "percent", amount: 7, minSubtotalCents: 0 } });
  const session = sessionTotalCents({ ...totals, lines: [line("X", cents, 1), line("Y", 550, 2)] });
  if (session !== totals.totalCents) { sweepFail2++; if (sweepFail2 < 4) console.log(`  coupon-sweep mismatch at subtotal=${cents}¢: order=${totals.totalCents} session=${session}`); }
}
console.log(sweepFail2 === 0 ? "PASS sweep with 7% coupon @10.25%" : `FAIL coupon-sweep: ${sweepFail2} mismatches`);
if (sweepFail2 > 0) failures++;

process.exit(failures === 0 ? 0 : 1);
