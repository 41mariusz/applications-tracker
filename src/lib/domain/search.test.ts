import { describe, expect, it } from "vitest";
import { filterApplications, matchesQuery, normalizePhone, normalizeText } from "@/lib/domain/search";

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

  it("does not match phones on too few digits or a different number", () => {
    expect(matchesQuery(acme, "60")).toBe(false);
    expect(matchesQuery(acme, "700 100 200")).toBe(false);
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

describe("filterApplications", () => {
  it("keeps the input order (importance) of matches", () => {
    expect(filterApplications([noPhone, lodz, acme], "senior").map((a) => a.company)).toEqual([
      "Globex",
      "Acme Software House",
    ]);
  });
});
