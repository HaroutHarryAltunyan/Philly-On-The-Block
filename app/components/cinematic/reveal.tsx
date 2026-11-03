"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";

type Tag = "h1" | "h2" | "h3" | "p" | "span" | "div";

/**
 * Word-by-word reveal when the element scrolls into view. The full text is
 * server-rendered and readable without JavaScript; the stagger is CSS
 * (`.reveal-words` in site.css) and is skipped for reduced motion.
 */
export function RevealWords({ as = "h2", text, className = "", id }: { as?: Tag; text: string; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);
  const Tag = as as "h2";
  return (
    <Tag ref={ref as React.RefObject<HTMLHeadingElement>} id={id} className={`reveal-words ${className}`.trim()} aria-label={text}>
      {text.split(" ").map((word, i) => (
        // The space must sit between the inline-block words, not inside them.
        <Fragment key={`${word}-${i}`}>
          {i > 0 && " "}
          <span className="rw" aria-hidden="true" style={{ "--i": i } as React.CSSProperties}>
            <span>{word}</span>
          </span>
        </Fragment>
      ))}
    </Tag>
  );
}

/** Fades/lifts its children in when scrolled into view. */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref);
  return (
    <div ref={ref} className={`reveal ${className}`.trim()} style={{ "--delay": `${delay}ms` } as React.CSSProperties}>
      {children}
    </div>
  );
}

function useReveal(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Mark as armed only once JS runs, so content is visible without it.
    el.classList.add("is-armed");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}
