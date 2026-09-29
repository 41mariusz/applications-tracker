// Dates are shown in the owner's time zone. Fixed (not the runtime's) so server-rendered
// HTML and hydrated React islands agree. Single-user app used in Poland.
export const DISPLAY_TIME_ZONE = "Europe/Warsaw";

const dateTimeFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

// `applied_on` is a plain calendar date (YYYY-MM-DD); format it at noon UTC so no time zone shifts the day.
export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(`${isoDate}T12:00:00Z`));
}

// Value for <input type="datetime-local"> in the browser's local time.
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
