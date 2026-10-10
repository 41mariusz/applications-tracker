import { describe, expect, it } from "vitest";
import { applicationCvUrl, cvFileUrl } from "./cv-urls";

const id = "00000000-0000-4000-8000-000000000001";

describe("cvFileUrl", () => {
  it("points at the inline file by default", () => {
    expect(cvFileUrl(id)).toBe(`/api/cv/${id}`);
    expect(cvFileUrl(id, { download: false })).toBe(`/api/cv/${id}`);
  });

  it("adds ?download=1 for a download", () => {
    expect(cvFileUrl(id, { download: true })).toBe(`/api/cv/${id}?download=1`);
  });

  it("encodes an id that is not a uuid", () => {
    expect(cvFileUrl("a/b?c")).toBe("/api/cv/a%2Fb%3Fc");
  });
});

describe("applicationCvUrl", () => {
  it("points at the application's CV route", () => {
    expect(applicationCvUrl(id)).toBe(`/api/applications/${id}/cv`);
  });

  it("encodes an id that is not a uuid", () => {
    expect(applicationCvUrl("a/b")).toBe("/api/applications/a%2Fb/cv");
  });
});
