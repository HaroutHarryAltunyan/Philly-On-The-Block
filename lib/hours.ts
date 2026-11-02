export type HourSchedule = [number, number] | null;

export type BusinessStatus = { open: boolean; label: string };

export function formatClock(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${displayHour} ${suffix}` : `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function getBusinessStatus(hours: Record<string, HourSchedule> | null): BusinessStatus {
  if (!hours) return { open: false, label: "View today’s hours" };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const day = value("weekday") ?? "Monday";
  const schedule = hours[day];

  if (!schedule) return { open: false, label: "Closed today" };

  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  const [opens, closes] = schedule;
  if (minutes >= opens && minutes < closes) {
    return { open: true, label: `Open now · until ${formatClock(closes)}` };
  }

  return {
    open: false,
    label: minutes < opens ? `Opens today · ${formatClock(opens)}` : "Closed for today",
  };
}

export const RESTAURANT_TIMEZONE = "America/Los_Angeles";

// Minutes the restaurant's wall clock is ahead of UTC at `at` (negative in LA).
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Start/end (exclusive) of the restaurant-local calendar day containing `at`. */
export function restaurantDayBounds(at: Date, timeZone = RESTAURANT_TIMEZONE): { start: Date; end: Date } {
  const local = new Date(at.getTime() + offsetMinutes(at, timeZone) * 60_000);
  const midnightLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(midnightLocalAsUtc - offsetMinutes(new Date(midnightLocalAsUtc), timeZone) * 60_000);
  const nextMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  const end = new Date(nextMidnight - offsetMinutes(new Date(nextMidnight), timeZone) * 60_000);
  return { start, end };
}
