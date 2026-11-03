import type { Metadata } from "next";
import { FAQS, faqSchema, jsonLd } from "../../../lib/seo";
import { SITE_NAME, STORE_PHONE_DISPLAY, STORE_PHONE_TEL } from "../../../lib/site";

export const metadata: Metadata = {
  title: { absolute: `FAQ — Philly Cheesesteaks in Burbank | ${SITE_NAME}` },
  description: "Answers about Philly on the Block: what’s on a Philly OTB, delivery areas, hours, catering, paying in person, and rewards.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqSchema())} />
      <section className="page-hero page-hero-blue">
        <p className="eyebrow">FAQ</p>
        <h1 className="display-xl">Good questions.</h1>
        <p className="lede">Still stuck? Call the truck at <a className="inline-link" href={`tel:${STORE_PHONE_TEL}`}>{STORE_PHONE_DISPLAY}</a>.</p>
      </section>
      <section className="page-body page-body-cream faq">
        <div className="faq-list narrow">
          {FAQS.map((faq) => (
            <details key={faq.q}>
              <summary>
                <h2>{faq.q}</h2>
                <span aria-hidden="true" />
              </summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
