"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import IngredientStory from "../cinematic/ingredient-story";
import { isLowPower, prefersReducedMotion, saveData, supportsWebGL, whenIdle } from "../cinematic/motion";
import { useShop } from "../shop/shop-context";
import type { StoreMenuItem } from "../../../lib/storefront";
import type { FoodScene, Label } from "./food-gl";

type Beat = {
  from: number;
  to: number;
  kicker?: string;
  title: string;
  body?: string;
  product?: "sandwich" | "fries";
};

// Scroll storyboard (0..1 through the pinned section). Every claim comes from
// the menu descriptions; the two product cards read live price + description.
const BEATS: Beat[] = [
  { from: 0, to: 0.11, kicker: "Philly OTB", title: "The real Philly experience.", body: "A fresh sesame roll, loaded end to end." },
  { from: 0.13, to: 0.22, kicker: "The chop", title: "Chopped fresh.", body: "Premium meat chopped on the griddle with grilled onions." },
  { from: 0.25, to: 0.33, kicker: "The melt", title: "Melted to perfection.", body: "Sharp white American, melted straight into the chop." },
  { from: 0.355, to: 0.47, kicker: "What’s inside", title: "Nothing extra. Just the real deal.", body: "Only what’s on the menu — down to the bell peppers and our two house sauces." },
  { from: 0.485, to: 0.555, title: "Philly OTB", product: "sandwich" },
  { from: 0.635, to: 0.71, kicker: "OTB Fries", title: "Loaded different.", body: "Shoestring fries under a full order of the chop." },
  { from: 0.725, to: 0.795, kicker: "From above", title: "Every fry. Fully loaded.", body: "Steak, grilled onions, and sharp white American, edge to edge." },
  { from: 0.81, to: 0.9, kicker: "What’s inside", title: "Steak. Cheese. Fries.", body: "Finished with OTB Ranch and OTB Tang." },
  { from: 0.935, to: 1.01, kicker: "OTB Fries", title: "The block does fries different.", product: "fries" },
];

const LABEL_IDS = ["s-top", "s1", "s2", "s3", "s4", "s5", "f0", "f1", "f2", "f3", "f4"];

function beatOpacity(p: number, b: Beat) {
  const fade = 0.018;
  if (p < b.from - fade || p > b.to + fade) return 0;
  const inT = Math.min(1, (p - (b.from - fade)) / fade);
  const outT = b.to >= 1 ? 1 : Math.min(1, (b.to + fade - p) / fade);
  return Math.max(0, Math.min(inT, outT));
}

const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * The 3D food story. Loads the Philly OTB and OTB Fries model files and drives
 * them with scroll. Devices without WebGL, with reduced motion, or on data
 * saver get the photo-based ingredient story instead; ordering never depends
 * on any of this.
 */
export default function FoodScroll({ sandwich, fries }: { sandwich: StoreMenuItem | null; fries: StoreMenuItem | null }) {
  const [mode, setMode] = useState<"photo" | "3d">("photo");
  const fallBack = useCallback(() => setMode("photo"), []);

  useEffect(() => {
    if (prefersReducedMotion() || saveData() || !supportsWebGL()) return;
    return whenIdle(() => setMode("3d"));
  }, []);

  if (mode === "photo") return <IngredientStory />;
  return <FoodScroll3D sandwich={sandwich} fries={fries} onFail={fallBack} />;
}

function FoodScroll3D({ sandwich, fries, onFail }: { sandwich: StoreMenuItem | null; fries: StoreMenuItem | null; onFail: () => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beatsRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const { openItem } = useShop();

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    let cancelled = false;
    let scene: FoodScene | null = null;
    let killTrigger: (() => void) | null = null;
    let io: IntersectionObserver | null = null;

    const beatEls = Array.from(beatsRef.current?.querySelectorAll<HTMLElement>("[data-beat]") ?? []);
    const labelEls = new Map(Array.from(labelsRef.current?.querySelectorAll<HTMLElement>("[data-label]") ?? []).map((el) => [el.dataset.label!, el]));

    const renderBeats = (p: number) => {
      beatEls.forEach((el, i) => {
        const o = beatOpacity(p, BEATS[i]);
        el.style.opacity = String(o);
        el.style.transform = `translate3d(0, ${(1 - o) * 24}px, 0)`;
        el.style.visibility = o > 0.01 ? "visible" : "hidden";
        el.toggleAttribute("inert", o < 0.5);
      });
    };
    renderBeats(0);

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !scene) return;
      const rect = section.getBoundingClientRect();
      scene.setPointer((event.clientX / window.innerWidth) * 2 - 1, ((event.clientY - Math.max(rect.top, 0)) / window.innerHeight) * 2 - 1);
    };

    Promise.all([import("./food-gl"), import("gsap"), import("gsap/ScrollTrigger")])
      .then(async ([{ mountFoodScene }, { gsap }, { ScrollTrigger }]) => {
        const mounted = await mountFoodScene(canvas, { lowPower: isLowPower() });
        if (cancelled) {
          mounted.dispose();
          return;
        }
        scene = mounted;
        scene.onFrame((labels: Label[]) => {
          const seen = new Set<string>();
          for (const l of labels) {
            const el = labelEls.get(l.id);
            if (!el) continue;
            seen.add(l.id);
            el.style.opacity = String(l.opacity);
            el.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0)`;
          }
          labelEls.forEach((el, id) => {
            if (!seen.has(id)) el.style.opacity = "0";
          });
        });
        gsap.registerPlugin(ScrollTrigger);
        const trigger = ScrollTrigger.create({
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            scene?.setProgress(self.progress);
            renderBeats(self.progress);
          },
        });
        killTrigger = () => trigger.kill();
        scene.setProgress(trigger.progress);
        renderBeats(trigger.progress);
        // Only render while the section is on screen.
        io = new IntersectionObserver(([entry]) => scene?.setActive(entry.isIntersecting), { rootMargin: "100px 0px" });
        io.observe(section);
        window.addEventListener("pointermove", onPointer, { passive: true });
        setReady(true);
      })
      .catch((error) => {
        console.warn("3D food scene unavailable, showing photos instead:", error);
        if (!cancelled) onFail();
      });

    return () => {
      cancelled = true;
      killTrigger?.();
      io?.disconnect();
      window.removeEventListener("pointermove", onPointer);
      scene?.dispose();
    };
  }, [onFail]);

  const card = (item: StoreMenuItem | null, title: string) =>
    item ? (
      <div className="food-product">
        <h3 className="display-lg">{item.name}</h3>
        <p className="food-product-desc">{item.description}</p>
        <div className="food-product-row">
          <span className="food-product-price">{money(item.price)}</span>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => openItem(item)}>
            Order now
          </button>
        </div>
      </div>
    ) : (
      <h3 className="display-lg">{title}</h3>
    );

  return (
    <section ref={sectionRef} id="bite" className={`food-scroll${ready ? " is-ready" : ""}`} aria-labelledby="food-title">
      <h2 id="food-title" className="sr-only">
        Inside the Philly OTB and the OTB Fries
      </h2>
      <div className="food-stage">
        <img className="food-poster" src="/images/menu/philly-otb.jpg" alt="" aria-hidden="true" width={750} height={1000} />
        <canvas ref={canvasRef} className="food-canvas" aria-hidden="true" />
        <div className="food-vignette" aria-hidden="true" />
        <div ref={labelsRef} className="food-labels" aria-hidden="true">
          {LABEL_IDS.map((id) => (
            <span key={id} data-label={id} className="food-label">
              <i />
              {labelText(id)}
            </span>
          ))}
        </div>
        <div ref={beatsRef} className="food-beats">
          {BEATS.map((beat, i) => (
            <div key={i} data-beat className={`food-beat${beat.product ? " is-product" : ""}`}>
              {beat.kicker ? <p className="eyebrow">{beat.kicker}</p> : null}
              {beat.product ? (
                <>
                  {beat.product === "fries" ? <p className="food-beat-title display-xl">{beat.title}</p> : null}
                  {card(beat.product === "sandwich" ? sandwich : fries, beat.title)}
                </>
              ) : (
                <>
                  <p className="food-beat-title display-xl">{beat.title}</p>
                  {beat.body ? <p className="lede">{beat.body}</p> : null}
                </>
              )}
            </div>
          ))}
        </div>
        {!ready ? <p className="food-loading" role="status">Firing up the griddle…</p> : null}
      </div>
    </section>
  );
}

// Kept in sync with LABELS in food-gl.ts (duplicated so the labels render
// before the 3D module loads).
function labelText(id: string) {
  const map: Record<string, string> = {
    "s-top": "Fresh bread",
    s1: "Premium meat",
    s2: "Grilled onions",
    s3: "Sharp white American",
    s4: "Bell peppers",
    s5: "OTB Ranch + OTB Tang",
    f0: "Shoestring fries",
    f1: "Steak",
    f2: "Grilled onions",
    f3: "Sharp white American",
    f4: "OTB Ranch + OTB Tang",
  };
  return map[id] ?? "";
}
