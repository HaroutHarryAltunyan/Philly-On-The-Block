import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "../../lib/site";

export const metadata: Metadata = {
  title: `Track Your Order | ${SITE_NAME} Burbank`,
  description:
    "Track your Philly on the Block order in real time — enter your order number and phone to see Burbank cheesesteak pickup or delivery status and live driver location.",
  alternates: { canonical: "/track" },
  openGraph: {
    title: `Track Your Order | ${SITE_NAME} Burbank`,
    description:
      "Track your Philly on the Block order in real time — Burbank cheesesteak pickup or delivery with live driver location.",
    url: `${SITE_URL}/track`,
    type: "website",
  },
};
