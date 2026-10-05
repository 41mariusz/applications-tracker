import { describe, expect, it } from "vitest";
import {
  filterApplications,
  matchesQuery,
  matchesStatus,
  normalizePhone,
  normalizeText,
  parseStatusFilter,
} from "@/lib/domain/search";

const app = (company: string, position: string, hr_contact_name: string | null, hr_contact_phone: string | null) => ({
  company,
  position,
  hr_contact_name,
  hr_contact_phone,
});

const acme = app("Acme Software House", "Senior Developer", "Anna Łukasik", "+48 600 100 200");
const lodz = app("Łódź Tech", "Junior QA", null, "0048 512-345-678");
const noPhone = app("Globex", "Senior Developer", "Jan Kowalski", null);

describe("normalizeText", () => {
  it("drops case and Polish diacritics, including ł", () => {
    expect(normalizeText("Łódź ŻÓŁĆ Gęś")).toBe("lodz zolc ges");
  });
});

describe("normalizePhone", () => {
  it.each(["+48 600 100 200", "0048600100200", "600-100-200", "(600) 100 200", "48600100200"])(
    "normalizes %s to the national number",
    (input) => {
      expect(normalizePhone(input)).toBe("600100200");
    },
  );
});

describe("matchesQuery", () => {
  it("matches company, position and HR name, ignoring case and diacritics", () => {
    expect(matchesQuery(acme, "SOFTWARE")).toBe(true);
    expect(matchesQuery(acme, "senior dev")).toBe(true);
    expect(matchesQuery(acme, "lukasik")).toBe(true);
    expect(matchesQuery(lodz, "lodz")).toBe(true);
  });

  it("requires every word to match", () => {
    expect(matchesQuery(acme, "acme senior")).toBe(true);
    expect(matchesQuery(acme, "acme junior")).toBe(false);
  });

  it.each(["600 100 200", "600-100-200", "+48600100200", "0048 600 100 200", "100 200", "100200"])(
    "finds the HR phone typed as %s",
    (query) => {
      expect(matchesQuery(acme, query)).toBe(true);
    },
  );

  it("does not match a different number or an application without a phone", () => {
    expect(matchesQuery(acme, "700 100 200")).toBe(false);
    expect(matchesQuery(acme, "+48 700")).toBe(false);
    expect(matchesQuery(acme, "48 700 1")).toBe(false);
    expect(matchesQuery(noPhone, "600")).toBe(false);
  });

  it("combines a word with a phone fragment", () => {
    expect(matchesQuery(lodz, "tech 345")).toBe(true);
    expect(matchesQuery(acme, "tech 345")).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesQuery(noPhone, "   ")).toBe(true);
  });
});

// PRD FR-005: phone search matches regardless of formatting (spaces, country prefix), and during
// a call the offer must not disappear while the number is being typed. Expected values come from
// FR-005 and the change plan (testing-call-scenario-browser), not from normalizePhone.
describe("matchesQuery — phone formats during a call", () => {
  const storedFormats = [
    "600 100 200",
    "600-100-200",
    "600100200",
    "+48 600 100 200",
    "+48600100200",
    "0048 600 100 200",
    "48600100200",
    "(+48) 600 100 200",
  ];
  const typedFormats = [
    "600 100 200",
    "600-100-200",
    "600100200",
    "+48 600 100 200",
    "+48600100200",
    "0048 600 100 200",
    "48 600 100 200",
    "48600100200",
    "00 48 600 100 200",
    "(0048) 600 100 200",
  ];
  const withPhone = (phone: string) => app("Acme", "Developer", null, phone);

  it.each(storedFormats.flatMap((stored) => typedFormats.map((typed) => [stored, typed])))(
    "finds the number stored as %s when typed as %s",
    (stored, typed) => {
      expect(matchesQuery(withPhone(stored), typed)).toBe(true);
    },
  );

  it.each(typedFormats)("keeps the offer on the list at every keystroke of %s", (typed) => {
    const offer = withPhone("600-100-200");
    for (let end = 1; end <= typed.length; end++) {
      expect(matchesQuery(offer, typed.slice(0, end)), `after typing "${typed.slice(0, end)}"`).toBe(true);
    }
  });

  it.each(["+48", "+48 6", "+48 60", "0048", "004", "00", "48", "48 60", "60"])(
    "treats %s as not a search yet and shows every application",
    (typed) => {
      expect(matchesQuery(noPhone, typed)).toBe(true);
      expect(matchesQuery(withPhone("700 800 900"), typed)).toBe(true);
    },
  );

  it("searches once three national digits are typed", () => {
    expect(matchesQuery(withPhone("600 100 200"), "+48 600")).toBe(true);
    expect(matchesQuery(withPhone("700 800 900"), "+48 600")).toBe(false);
    expect(matchesQuery(noPhone, "+48 600")).toBe(false);
  });

  // Accepted trade-off (impl review F1): a short digit-only query cannot be told apart from the
  // start of a number being typed, so it shows everything even when meant as text.
  it("shows everything for a short digit-only query, also one meant as text", () => {
    expect(matchesQuery(app("Firma 12", "Developer", null, null), "12")).toBe(true);
    expect(matchesQuery(acme, "12")).toBe(true);
    expect(matchesQuery(withPhone("700 800 900"), "485")).toBe(true);
  });

  it("reads 48 typed without + as the country code, so a number containing every typed digit is found too", () => {
    expect(matchesQuery(withPhone("600 100 200"), "48 600")).toBe(true);
    expect(matchesQuery(withPhone("500 486 001"), "486001")).toBe(true);
    expect(matchesQuery(withPhone("700 800 900"), "48 600")).toBe(false);
  });
});

describe("filterApplications", () => {
  it("keeps the input order (importance) of matches", () => {
    expect(filterApplications([noPhone, lodz, acme], "senior").map((a) => a.company)).toEqual([
      "Globex",
      "Acme Software House",
    ]);
  });
});

describe("parseStatusFilter", () => {
  it("accepts comma-separated and repeated values, in pipeline order", () => {
    expect(parseStatusFilter(["offer,interviews"])).toEqual(["interviews", "offer"]);
    expect(parseStatusFilter(["sent", "rejected"])).toEqual(["sent", "rejected"]);
  });

  it("ignores unknown values and empty input", () => {
    expect(parseStatusFilter(["offer,bogus", ""])).toEqual(["offer"]);
    expect(parseStatusFilter([])).toEqual([]);
  });
});

describe("matchesStatus", () => {
  it("shows everything when nothing is selected", () => {
    expect(matchesStatus("rejected", [])).toBe(true);
  });

  it("shows only selected statuses otherwise", () => {
    expect(matchesStatus("offer", ["offer", "interviews"])).toBe(true);
    expect(matchesStatus("sent", ["offer", "interviews"])).toBe(false);
  });
});
