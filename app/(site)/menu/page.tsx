import type { Metadata } from "next";
import MenuGrid from "../../components/shop/menu-grid";
import { OpenStatus } from "../../components/shop/live-hours";
import { jsonLd, menuSchema } from "../../../lib/seo";
import { SITE_NAME } from "../../../lib/site";
import { getStorefront } from "../../../lib/storefront-server";

export const metadata: Metadata = {
  title: { absolute: `Menu & Prices — Philly Cheesesteaks in Burbank | ${SITE_NAME}` },
  description:
    "The Philly on the Block menu: Philly OTB, Classic Philly, Philly Melt, Fries, and loaded OTB Fries. Live prices, order pickup or delivery in Burbank, and pay in person.",
  alternates: { canonical: "/menu" },
};

export default async function MenuPage() {
  const { menu } = await getStorefront();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(menuSchema(menu))} />
      <section className="page-hero page-hero-green">
        <p className="eyebrow">The menu</p>
        <h1 className="display-xl">Choose your damage.</h1>
        <p className="lede">Hand-chopped cheesesteaks, loaded fries, cold Cokes. Order for pickup or delivery and pay in person — cash or card.</p>
        <OpenStatus />
      </section>
      <section className="section section-blue" aria-label="Menu items">
        <MenuGrid headingLevel={2} />
      </section>
    </>
  );
}
