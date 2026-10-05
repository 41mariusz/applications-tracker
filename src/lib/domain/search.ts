import { APPLICATION_STATUSES, type ApplicationStatus } from "@/types";

// Search rule (PRD FR-005): find an application during a call by company, position,
// HR contact name, or HR phone — regardless of phone formatting, case, or Polish diacritics.
// Pure functions, shared by the server (?q=) and the browser (as-you-type filter).

export interface Searchable {
  company: string;
  position: string;
  hr_contact_name: string | null;
  hr_contact_phone: string | null;
}

// "Łódź" → "lodz"; ł has no Unicode decomposition, so it is mapped explicitly.
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

// "+48 600-100-200", "0048600100200" and "600100200" all become "600100200".
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const withoutPrefix = trimmed.startsWith("+48")
    ? trimmed.slice(3)
    : trimmed.startsWith("0048")
      ? trimmed.slice(4)
      : trimmed;
  const digits = withoutPrefix.replace(/\D/g, "");
  // A stored number typed without "+" but with the country code: 48 + 9 digits.
  return digits.length === 11 && digits.startsWith("48") ? digits.slice(2) : digits;
}

const PHONE_QUERY = /^[\d\s+\-().]+$/;
const MIN_PHONE_DIGITS = 3;

// How a number being typed can be read: the national digits after a "+48"/"0048" prefix, and —
// when "48" is typed without "+" — also the full digits, since 48 may be the start of the number.
// A beginning of "0048" ("0", "00", "004") has no national digits yet.
function phoneQueryReadings(query: string): { national: string; full: string | null } {
  if (query.startsWith("+48")) return { national: query.slice(3).replace(/\D/g, ""), full: null };
  if (query.startsWith("0048")) return { national: query.slice(4).replace(/\D/g, ""), full: null };
  const digits = query.replace(/\D/g, "");
  if (!query.startsWith("+") && "0048".startsWith(digits)) return { national: "", full: null };
  if (!query.startsWith("+") && digits.startsWith("48")) return { national: digits.slice(2), full: digits };
  return { national: digits, full: null };
}

export function matchesQuery(item: Searchable, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const phone = item.hr_contact_phone ? normalizePhone(item.hr_contact_phone) : "";

  // A query made only of phone characters is one phone number, however it is spaced. While it has
  // fewer than 3 national digits ("+48", "0048", "48 6") it is not a search yet: during a call the
  // offer must stay on the list at every keystroke, so everything matches.
  if (PHONE_QUERY.test(q)) {
    const { national, full } = phoneQueryReadings(q);
    if (national.length < MIN_PHONE_DIGITS) return true;
    if (phone.includes(national) || (full !== null && phone.includes(full))) return true;
  }

  const haystack = normalizeText([item.company, item.position, item.hr_contact_name ?? ""].join(" "));
  // Every word must match somewhere: "acme senior" narrows down.
  return normalizeText(q)
    .split(/\s+/)
    .every((token) => {
      if (haystack.includes(token)) return true;
      const digits = token.replace(/\D/g, "");
      return digits.length >= MIN_PHONE_DIGITS && digits === token.replace(/[\s+\-().]/g, "") && phone.includes(digits);
    });
}

export function filterApplications<T extends Searchable>(items: readonly T[], query: string): T[] {
  return items.filter((item) => matchesQuery(item, query));
}

// Status filter (PRD FR-008): `?status=offer,interviews` or repeated `?status=` values.
// Unknown values are ignored; an empty selection shows every status.
export function parseStatusFilter(values: readonly string[]): ApplicationStatus[] {
  const requested = new Set(values.flatMap((v) => v.split(",")).map((v) => v.trim()));
  return APPLICATION_STATUSES.filter((s) => requested.has(s));
}

export function matchesStatus(status: ApplicationStatus, selected: readonly ApplicationStatus[]): boolean {
  return selected.length === 0 || selected.includes(status);
}
