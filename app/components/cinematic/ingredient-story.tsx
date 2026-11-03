"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

type Shot = { scale: number; x: number; y: number };

/** Where image point `focus` (0..1) lands inside an object-fit: cover box, as %. */
function coverOrigin(img: HTMLImageElement, focus: [number, number]): string {
  const W = img.clientWidth || 1;
  const H = img.clientHeight || 1;
  const w = img.naturalWidth || 750;
  const h = img.naturalHeight || 1000;
  const s = Math.max(W / w, H / h);
  const [px, py] = (getComputedStyle(img).objectPosition || "50% 50%").split(" ").map((v) => parseFloat(v) / 100);
  const x = (W - w * s) * (Number.isFinite(px) ? px : 0.5) + focus[0] * w * s;
  const y = (H - h * s) * (Number.isFinite(py) ? py : 0.5) + focus[1] * h * s;
  return `${((x / W) * 100).toFixed(2)}% ${((y / H) * 100).toFixed(2)}%`;
}

type Beat = {
  key: string;
  image: string;
  alt: string;
  kicker: string;
  title: string;
  body: string;
  /** Subject in the photo (0..1 from the top-left); the camera pushes toward it. */
  focus: [number, number];
  /** Camera start and end: zoom about the subject plus a small drift (% of frame). */
  from: Shot;
  to: Shot;
};

// Every claim here comes from the published menu descriptions.
const BEATS: Beat[] = [
  {
    key: "bread",
    image: "/images/menu/classic-philly.jpg",
    alt: "A Philly on the Block cheesesteak roll on deli paper",
    kicker: "01 — The foundation",
    title: "Fresh bread.",
    body: "Every cheesesteak starts on freshly baked bread, built to hold the whole chop.",
    focus: [0.5, 0.58],
    from: { scale: 1.35, x: -3, y: 2 },
    to: { scale: 1.05, x: 0, y: 0 },
  },
  {
    key: "meat",
    image: "/images/menu/philly-otb.jpg",
    alt: "The inside of a cheesesteak: chopped meat and onions",
    kicker: "02 — The chop",
    title: "Premium meat.",
    body: "Hand-chopped to order on the griddle with grilled onions.",
    focus: [0.4, 0.13],
    from: { scale: 1.02, x: 0, y: 3 },
    to: { scale: 1.25, x: 0, y: 0 },
  },
  {
    key: "cheese",
    image: "/images/menu/philly-otb.jpg",
    alt: "Cheese melted through a chopped cheesesteak",
    kicker: "03 — The melt",
    title: "Sharp white American.",
    body: "Melted straight through the meat. The Philly OTB adds spicy pepper on top.",
    focus: [0.3, 0.12],
    from: { scale: 1.25, x: 2, y: 0 },
    to: { scale: 1.4, x: -2, y: 1 },
  },
  {
    key: "sauce",
    image: "/images/menu/otb-fries.jpg",
    alt: "OTB Fries with steak, cheese, and house sauces",
    kicker: "04 — The signature",
    title: "OTB Ranch + OTB Tang.",
    body: "Two house sauces. Both on the Philly OTB and the loaded OTB Fries.",
    focus: [0.52, 0.42],
    from: { scale: 1.3, x: 0, y: -2 },
    to: { scale: 1.02, x: 0, y: 0 },
  },
];

const frame = (shot: Shot) => `translate3d(${shot.x}%, ${shot.y}%, 0) scale(${shot.scale})`;

export default function IngredientStory() {
  const rootRef = useRef<HTMLElement>(null);
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    let aim: () => void = () => undefined;

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        setEnhanced(true);
        // Wait a frame so the enhanced (sticky) layout is in place before
        // ScrollTrigger measures it.
        requestAnimationFrame(() => {
          if (cancelled) return;
          const ctx = gsap.context(() => {
            const layers = gsap.utils.toArray<HTMLElement>(".bite-layer", root);
            const photos = gsap.utils.toArray<HTMLElement>(".bite-layer img", root);
            const texts = gsap.utils.toArray<HTMLElement>(".bite-beat", root);
            const ticks = gsap.utils.toArray<HTMLElement>(".bite-tick", root);

            gsap.set(layers, { autoAlpha: 0 });
            gsap.set(texts, { autoAlpha: 0, y: 48 });
            // Zoom about each subject's on-screen position; recomputed when
            // ScrollTrigger re-measures (resize, orientation change).
            aim = () => BEATS.forEach((beat, i) => (photos[i].style.transformOrigin = coverOrigin(photos[i] as HTMLImageElement, beat.focus)));
            aim();
            ScrollTrigger.addEventListener("refreshInit", aim);

            const tl = gsap.timeline({
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: root,
                start: "top top",
                end: "bottom bottom",
                scrub: 0.8,
                onUpdate: (self) => root.style.setProperty("--bite-progress", self.progress.toFixed(4)),
              },
            });

            tl.to(".bite-intro", { autoAlpha: 0, y: -40, duration: 0.45 }, 0.15);
            BEATS.forEach((beat, i) => {
              const at = 0.35 + i;
              tl.to(layers[i], { autoAlpha: 1, duration: 0.35 }, at)
                .fromTo(photos[i], { transform: frame(beat.from) }, { transform: frame(beat.to), duration: 1.15 }, at)
                .to(texts[i], { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }, at + 0.15)
                .to(ticks[i], { "--fill": 1, duration: 0.8 }, at + 0.1);
              if (i < BEATS.length - 1) {
                tl.to(texts[i], { autoAlpha: 0, y: -48, duration: 0.25, ease: "power2.in" }, at + 0.85);
              }
            });
            tl.to(".bite-outro", { autoAlpha: 1, y: 0, duration: 0.3 }, BEATS.length + 0.2);
          }, root);
          cleanup = () => {
            ScrollTrigger.removeEventListener("refreshInit", aim);
            ctx.revert();
            ScrollTrigger.getAll().forEach((trigger) => trigger.trigger === root && trigger.kill());
          };
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <section ref={rootRef} id="bite" className={`bite${enhanced ? " is-enhanced" : ""}`} aria-labelledby="bite-title">
      <div className="bite-sticky">
        <div className="bite-stage">
          {BEATS.map((beat) => (
            <figure key={beat.key} className="bite-layer">
              <img
                src={beat.image}
                alt={beat.alt}
                loading="lazy"
                decoding="async"
                width={750}
                height={1000}
                style={{ objectPosition: `${beat.focus[0] * 100}% ${beat.focus[1] * 100}%` }}
              />
            </figure>
          ))}
          <div className="bite-grain" aria-hidden="true" />
        </div>

        <div className="bite-intro">
          <p className="eyebrow">What’s inside</p>
          <h2 id="bite-title" className="display-xl">Every bite hits different.</h2>
        </div>

        <ol className="bite-beats">
          {BEATS.map((beat) => (
            <li key={beat.key} className="bite-beat">
              <span className="eyebrow">{beat.kicker}</span>
              <h3 className="display-lg">{beat.title}</h3>
              <p>{beat.body}</p>
            </li>
          ))}
        </ol>

        <div className="bite-outro">
          <a className="btn btn-primary" href="/menu">Build your order</a>
        </div>

        <div className="bite-progress" aria-hidden="true">
          {BEATS.map((beat) => (
            <span key={beat.key} className="bite-tick" />
          ))}
        </div>
      </div>
    </section>
  );
}
