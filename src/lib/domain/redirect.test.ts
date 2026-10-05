import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/domain/redirect";

describe("safeNextPath", () => {
  it.each(["/applications/x", "/applications/9b2f?tab=notes", "/dashboard?q=acme&status=offer", "/cv"])(
    "keeps the in-app path %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ["//evil.com", "protocol-relative URL"],
    ["/\\evil", "backslash after the slash"],
    ["/applications\\..\\x", "backslash later in the path"],
    ["https://evil.com", "absolute URL"],
    ["javascript:alert(1)", "script URL"],
    ["applications/x", "relative path"],
    ["/\t/evil.com", "tab that browsers drop"],
    ["/\n/evil.com", "newline that browsers drop"],
    ["", "empty value"],
  ])("falls back to the list for %j (%s)", (value) => {
    expect(safeNextPath(value)).toBe("/dashboard");
  });

  it("falls back to the list when there is no value", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});
