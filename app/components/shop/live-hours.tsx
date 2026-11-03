"use client";

import { hoursLines } from "../../../lib/seo";
import { useShop } from "./shop-context";

/** Live "Open now · until 9 PM" pill from the dashboard-managed hours. */
export function OpenStatus({ className = "" }: { className?: string }) {
  const { status } = useShop();
  return (
    <a className={`status-pill${status.open ? " is-open" : ""} ${className}`.trim()} href="/visit">
      <i aria-hidden="true" /> {status.label}
    </a>
  );
}

/** Weekly hours table; today's row is highlighted after hydration. */
export function HoursList({ className = "" }: { className?: string }) {
  const { hours } = useShop();
  const today =
    typeof window === "undefined"
      ? ""
      : new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long" }).format(new Date());
  return (
    <dl className={`hours-list ${className}`.trim()} suppressHydrationWarning>
      {hoursLines(hours).map(({ day, label }) => (
        <div key={day} className={day === today ? "is-today" : undefined} suppressHydrationWarning>
          <dt>{day}</dt>
          <dd>{label}</dd>
        </div>
      ))}
    </dl>
  );
}
