import type { Metadata } from "next";
import { RevealWords } from "../../components/cinematic/reveal";
import PointsLookup from "./points-lookup";
import { SITE_NAME } from "../../../lib/site";
import { POINTS_PER_DOLLAR } from "../../../lib/points";

export const metadata: Metadata = {
  title: { absolute: `Rewards — Block Points | ${SITE_NAME}` },
  description: "Earn 4 points per $1 on every Philly on the Block order and redeem 100 points for $1 off at checkout.",
  alternates: { canonical: "/rewards" },
};

// Rules mirror lib/points.ts (earn rate) and checkout (100 points = $1).
const STEPS = [
  { n: "01", title: "Order", body: "Order online or in the app with your phone number." },
  { n: "02", title: "Earn", body: `Every paid order earns ${POINTS_PER_DOLLAR} points per $1 of subtotal — $1 back for every $25.` },
  { n: "03", title: "Redeem", body: "At checkout, enter the same phone number and use your points: 100 points = $1 off." },
];

export default function RewardsPage() {
  return (
    <>
      <section className="page-hero rewards-hero">
        <p className="eyebrow">Rewards</p>
        <RevealWords as="h1" className="display-xl" text="Eat. Earn. Repeat." />
        <p className="lede">Block points stack up on every order. No card, no app required — they follow your phone number.</p>
      </section>
      <section className="page-body">
        <ol className="reward-steps">
          {STEPS.map((step) => (
            <li key={step.n} className="reward-step">
              <span>{step.n}</span>
              <h2 className="display-md">{step.title}</h2>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="grid-2 rewards-grid">
          <PointsLookup />
          <div className="panel panel-ink form-grid">
            <h2 className="display-md">Want your history too?</h2>
            <p className="muted-light">
              Sign in with your email to see every order, what you earned and redeemed on each one, and reorder in a tap.
            </p>
            <a className="btn btn-primary" href="/account#rewards">Open my account</a>
          </div>
        </div>
        <p className="field-note rewards-fine">
          Points are added when an order is paid and removed if it’s cancelled. Points have no cash value.
        </p>
      </section>
    </>
  );
}
