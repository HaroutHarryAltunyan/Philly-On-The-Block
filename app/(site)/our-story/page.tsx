import type { Metadata } from "next";
import MagneticLink from "../../components/cinematic/magnetic";
import { Reveal, RevealWords } from "../../components/cinematic/reveal";
import { SITE_NAME } from "../../../lib/site";

export const metadata: Metadata = {
  title: { absolute: `Our Story — Burbank Cheesesteaks | ${SITE_NAME}` },
  description:
    "Philly on the Block keeps it focused: hand-chopped cheesesteaks on freshly baked bread, house sauces OTB Ranch and OTB Tang, and a cheesesteak truck at 2600 W Victory Blvd in Burbank.",
  alternates: { canonical: "/our-story" },
};

// Only facts the business already publishes (menu, sauces, location). No
// invented history, founders, or milestones.
const CHAPTERS = [
  {
    image: "/images/menu/classic-philly.jpg",
    alt: "A cheesesteak roll on deli paper",
    kicker: "Fresh preparation",
    title: "Chopped to order.",
    body: "Every cheesesteak is hand-chopped on the griddle when you order it, on freshly baked bread.",
  },
  {
    image: "/images/menu/philly-otb.jpg",
    alt: "A Philly OTB cut open beside OTB Fries",
    kicker: "A focused menu",
    title: "Do a few things right.",
    body: "Cheesesteaks, seasoned fries, and cold Cokes. That’s the menu, and that’s the point.",
  },
  {
    image: "/images/menu/otb-fries.jpg",
    alt: "OTB Fries covered in steak, cheese, and house sauces",
    kicker: "House sauces",
    title: "OTB Ranch. OTB Tang.",
    body: "Two sauces you won’t find anywhere else — on the Philly OTB and the loaded OTB Fries.",
  },
  {
    image: "/images/menu/philly-melt.jpg",
    alt: "A Philly Melt on Texas toast",
    kicker: "Premium ingredients",
    title: "Premium meat. Sharp white American.",
    body: "Grilled onions and sharp white American melted straight through the chop.",
  },
];

export default function OurStoryPage() {
  return (
    <>
      <section className="story-open">
        <div className="story-open-art" aria-hidden="true">
          <img className="story-open-crosswalk" src="/images/otb-crosswalk.png" alt="" width={1800} height={600} />
          <img className="story-open-sign" src="/images/otb-street-sign.png" alt="" width={904} height={1157} />
        </div>
        <div className="story-open-copy">
          <p className="eyebrow">Our story</p>
          <RevealWords as="h1" className="display-hero" text="No shortcuts. No soft opinions." />
          <Reveal delay={300}>
            <p className="lede">
              Real Philly flavor on a Burbank block — from the cheesesteak truck at 2600 W Victory Blvd.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="chapters" aria-label="What we stand for">
        {CHAPTERS.map((chapter, index) => (
          <article key={chapter.title} className={`chapter${index % 2 ? " is-flipped" : ""}`}>
            <Reveal className="chapter-media">
              <img src={chapter.image} alt={chapter.alt} loading="lazy" decoding="async" width={750} height={1000} />
            </Reveal>
            <div className="chapter-copy">
              <p className="eyebrow">{String(index + 1).padStart(2, "0")} — {chapter.kicker}</p>
              <RevealWords as="h2" className="display-lg" text={chapter.title} />
              <Reveal delay={150}>
                <p className="lede">{chapter.body}</p>
              </Reveal>
            </div>
          </article>
        ))}
      </section>

      <section className="section section-green story-close">
        <div className="story-close-mascots" aria-hidden="true">
          <img src="/images/otb-mascot-left.png" alt="" loading="lazy" width={1056} height={1400} />
          <img src="/images/otb-mascot-right.png" alt="" loading="lazy" width={1005} height={1329} />
        </div>
        <div>
          <RevealWords as="h2" className="display-xl" text="This is Philly on the Block." />
          <Reveal delay={200}>
            <div className="stack-actions">
              <MagneticLink className="btn btn-primary btn-lg" href="/menu">Order your Philly</MagneticLink>
              <a className="btn btn-cream btn-lg" href="/visit">Find the truck</a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
