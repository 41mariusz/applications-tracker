import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/domain/ids";

describe("isUuid", () => {
  it.each(["3f0e8b8c-1d2a-4c5b-9e6f-7a8b9c0d1e2f", "3F0E8B8C-1D2A-4C5B-9E6F-7A8B9C0D1E2F"])("accepts %s", (id) => {
    expect(isUuid(id)).toBe(true);
  });

  it.each([
    "abc",
    "",
    "3f0e8b8c-1d2a-4c5b-9e6f-7a8b9c0d1e2",
    "3f0e8b8c1d2a4c5b9e6f7a8b9c0d1e2f",
    "3f0e8b8c-1d2a-4c5b-9e6f-7a8b9c0d1e2g",
  ])("rejects %j", (id) => {
    expect(isUuid(id)).toBe(false);
  });

  it("rejects a missing id", () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
