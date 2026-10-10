import { describe, expect, it } from "vitest";
import { decideWipe, parseDemoArgs } from "./demo-data-guard.mjs";

const demo = (n) => Array.from({ length: n }, (_, i) => ({ company: `[TEST] Firma ${i}`, position: "Dev" }));
const base = { mode: "clear-only", confirm: null, includeReal: false, accountEmail: "Owner@Example.com" };

describe("parseDemoArgs", () => {
  it("seeds by default", () => {
    expect(parseDemoArgs([])).toEqual({ ok: true, mode: "seed", confirm: null, includeReal: false });
  });

  it("reads --reset and --clear-only", () => {
    expect(parseDemoArgs(["--reset"])).toMatchObject({ ok: true, mode: "reset" });
    expect(parseDemoArgs(["--clear-only"])).toMatchObject({ ok: true, mode: "clear-only" });
  });

  it("normalises --confirm (case and spaces) and reads --include-real", () => {
    expect(parseDemoArgs(["--clear-only", "--confirm= Owner@Example.COM ", "--include-real"])).toEqual({
      ok: true,
      mode: "clear-only",
      confirm: "owner@example.com",
      includeReal: true,
    });
  });

  it("treats an empty --confirm= as no confirmation", () => {
    expect(parseDemoArgs(["--clear-only", "--confirm="])).toMatchObject({ ok: true, confirm: null });
  });

  it("refuses --reset together with --clear-only", () => {
    expect(parseDemoArgs(["--reset", "--clear-only"])).toMatchObject({ ok: false });
  });

  it("refuses unknown arguments and safety flags without a destructive mode", () => {
    expect(parseDemoArgs(["--clear"])).toMatchObject({ ok: false });
    expect(parseDemoArgs(["--confirm=owner@example.com"])).toMatchObject({ ok: false });
    expect(parseDemoArgs(["--include-real"])).toMatchObject({ ok: false });
  });
});

describe("decideWipe", () => {
  it("seed mode just seeds", () => {
    expect(decideWipe({ ...base, mode: "seed", applications: demo(3) })).toEqual({ action: "seed" });
  });

  it("previews a destructive mode without --confirm", () => {
    expect(decideWipe({ ...base, applications: demo(3) })).toEqual({ action: "preview" });
    expect(decideWipe({ ...base, mode: "reset", applications: demo(3) })).toEqual({ action: "preview" });
  });

  it("proceeds when --confirm matches the account, ignoring case", () => {
    expect(decideWipe({ ...base, confirm: "owner@example.com", applications: demo(3) })).toEqual({
      action: "proceed",
    });
  });

  it("refuses a --confirm for another account", () => {
    const result = decideWipe({ ...base, confirm: "someone@example.com", applications: demo(3) });
    expect(result.action).toBe("refuse");
    expect(result.reason).toContain("does not match");
  });

  it("refuses while real applications exist — even with a correct --confirm", () => {
    const applications = [...demo(2), { company: "Prawdziwa Firma", position: "Frontend Developer" }];
    for (const confirm of [null, "owner@example.com"]) {
      const result = decideWipe({ ...base, confirm, applications });
      expect(result.action).toBe("refuse");
      expect(result.realExamples).toEqual(["Prawdziwa Firma — Frontend Developer"]);
    }
  });

  it("--include-real lifts the guard but still needs the confirmation", () => {
    const applications = [{ company: "Prawdziwa Firma" }];
    expect(decideWipe({ ...base, includeReal: true, applications })).toEqual({ action: "preview" });
    expect(decideWipe({ ...base, includeReal: true, confirm: "owner@example.com", applications })).toEqual({
      action: "proceed",
    });
  });

  it("lists at most five real applications", () => {
    const applications = Array.from({ length: 8 }, (_, i) => ({ company: `Firma ${i}` }));
    expect(decideWipe({ ...base, applications }).realExamples).toHaveLength(5);
  });

  it("an empty account previews, then proceeds when confirmed", () => {
    expect(decideWipe({ ...base, applications: [] })).toEqual({ action: "preview" });
    expect(decideWipe({ ...base, confirm: "owner@example.com", applications: [] })).toEqual({ action: "proceed" });
  });
});
