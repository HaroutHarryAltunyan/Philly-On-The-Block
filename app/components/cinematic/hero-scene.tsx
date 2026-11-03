"use client";

import { useEffect, useRef, useState } from "react";
import { isLowPower, prefersReducedMotion, saveData, supportsWebGL, whenIdle } from "./motion";

const HERO_IMAGE = "/images/menu/philly-otb.jpg";
// Where the cut cheesesteak sits in that photo (0..1 from the top-left).
const HERO_FOCUS: [number, number] = [0.36, 0.14];

/**
 * Full-screen opening shot. The <img> is the real content (and the LCP
 * element); the WebGL canvas fades in over it only when the device can
 * afford it and the visitor hasn't asked for reduced motion.
 */
export type HeroFeature = { name: string; price: number; description: string };

export default function HeroScene({ children, feature }: { children: React.ReactNode; feature?: HeroFeature | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion() || saveData() || !supportsWebGL()) return;
    let handle: { dispose: () => void } | null = null;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      import("./hero-gl")
        .then(({ mountHero }) => {
          if (cancelled) return;
          handle = mountHero(canvas, {
            image: HERO_IMAGE,
            focus: HERO_FOCUS,
            // Desktop: the stage is its own right-hand panel, so center the
            // subject a little high. Phones: full-bleed, subject high above
            // the copy.
            shift: () => (window.innerWidth > 900 ? [0, -0.12] : [0, -0.22]),
            lowPower: isLowPower(),
            onReady: () => setLive(true),
          });
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
      cancelIdle();
      handle?.dispose();
    };
  }, []);

  return (
    <section className={`hero${live ? " is-live" : ""}`} aria-labelledby="hero-title">
      <div className="hero-stage">
        <img
          className="hero-poster"
          src={HERO_IMAGE}
          alt="A Philly OTB cheesesteak cut open next to a box of loaded OTB Fries"
          fetchPriority="high"
          decoding="async"
          width={750}
          height={1000}
        />
        <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
        <div className="hero-shade" aria-hidden="true" />
      </div>
      {/* The original site's street scene: crosswalk, truck, sign pole behind, and both Philly boys side by side. */}
      <div className="hero-street" aria-label="Philly on the Block neighborhood illustration">
        <img className="street-crosswalk" src="/images/otb-crosswalk.png" alt="" width={1800} height={600} decoding="async" />
        <img className="street-sign" src="/images/otb-street-sign.png" alt="Philly on the Block street sign in Burbank, CA" width={904} height={1157} decoding="async" />
        <img className="street-truck" src="/images/otb-food-truck.png" alt="Philly on the Block cheesesteak food truck in Burbank" width={1390} height={1017} decoding="async" />
        <img className="street-mascot street-mascot-left" src="/images/otb-mascot-left.png" alt="Philly on the Block founder holding a Burbank cheesesteak" width={1056} height={1400} decoding="async" />
        <img className="street-mascot street-mascot-right" src="/images/otb-mascot-right.png" alt="Philly on the Block founder holding a Burbank cheesesteak" width={1005} height={1329} decoding="async" />
        {feature ? (
          <div className="street-ticket">
            <span>Today’s move</span>
            <strong>{feature.name}</strong>
            <small>{feature.description} · ${feature.price.toFixed(2)}</small>
          </div>
        ) : null}
      </div>
      <div className="hero-copy">{children}</div>
      <a className="scroll-cue" href="#bite" aria-label="Scroll to the ingredients">
        <span aria-hidden="true" />
      </a>
    </section>
  );
}
