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
