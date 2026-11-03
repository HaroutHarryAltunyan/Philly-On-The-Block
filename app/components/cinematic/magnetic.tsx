"use client";

import { useRef, type AnchorHTMLAttributes } from "react";

/** A link that leans toward a mouse pointer (desktop only; no effect on touch). */
export default function MagneticLink({ className = "", children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const ref = useRef<HTMLAnchorElement>(null);
  return (
    <a
      {...props}
      ref={ref}
      className={`magnetic ${className}`.trim()}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) * 0.22;
        const y = (event.clientY - rect.top - rect.height / 2) * 0.32;
        ref.current.style.setProperty("--mag-x", `${x.toFixed(1)}px`);
        ref.current.style.setProperty("--mag-y", `${y.toFixed(1)}px`);
      }}
      onPointerLeave={() => {
        ref.current?.style.setProperty("--mag-x", "0px");
        ref.current?.style.setProperty("--mag-y", "0px");
      }}
    >
      {children}
    </a>
  );
}
