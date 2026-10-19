import { describe, expect, it, vi } from "vitest";
import { assessCredits, checkCredits, type CreditsVerdict, formatVerdict } from "./credits.js";

// A fake key: every verdict produced below is checked not to contain it.
const API_KEY = "sk-or-v1-fake-test-key-0123456789";
const PAID_MODEL = "deepseek/deepseek-v4.1-flash";
const FREE_MODEL = "deepseek/deepseek-v4.1-flash:free";

const verdicts: CreditsVerdict[] = [];
function seen(verdict: CreditsVerdict) {
  verdicts.push(verdict);
  return verdict;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const CREDITS_OK = { data: { total_credits: 10, total_usage: 2.5 } };
const KEY_OK = { data: { limit: null, limit_remaining: null, usage: 2.5, is_free_tier: false } };

/** A fake fetch answering per endpoint path (the part after the base URL). */
function fakeFetch(routes: Record<string, () => Response>) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const path = Object.keys(routes).find((route) => url.endsWith(route));
    if (!path) throw new Error(`unexpected request ${url}`);
    return routes[path]!();
  });
}

describe("assessCredits", () => {
  it("is ok with a positive balance and no key limit", () => {
    const verdict = seen(assessCredits({ totalCredits: 10, totalUsage: 4, keyLimitRemaining: null }));

    expect(verdict).toEqual({ kind: "ok", remaining: 6, keyLimitRemaining: null });
  });

  it("is insufficient when the account balance is exhausted", () => {
    const verdict = seen(assessCredits({ totalCredits: 5, totalUsage: 5, keyLimitRemaining: null }));

    expect(verdict.kind).toBe("insufficient");
    expect(verdict.kind === "insufficient" && verdict.message).toMatch(/account balance/);
    expect(verdict.kind === "insufficient" && verdict.message).toContain("https://openrouter.ai/settings/credits");
  });

  it("is insufficient when the key limit is exhausted while the account has credits left", () => {
    const verdict = seen(assessCredits({ totalCredits: 10, totalUsage: 1, keyLimitRemaining: 0 }));

    expect(verdict.kind).toBe("insufficient");
    expect(verdict.kind === "insufficient" && verdict.message).toMatch(/key's credit limit/);
  });
});

describe("checkCredits", () => {
  it("skips a free model without any request", async () => {
    const fetchFn = fakeFetch({});

    const verdict = seen(await checkCredits({ apiKey: API_KEY, model: FREE_MODEL, fetchFn }));

    expect(verdict.kind).toBe("skipped");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("checks a free model when requireCredits is set", async () => {
    const fetchFn = fakeFetch({ "/credits": () => json(CREDITS_OK), "/key": () => json(KEY_OK) });

    const verdict = seen(await checkCredits({ apiKey: API_KEY, model: FREE_MODEL, requireCredits: true, fetchFn }));

    expect(verdict.kind).toBe("ok");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("is unknown when /key answers 401", async () => {
    const fetchFn = fakeFetch({
      "/credits": () => json(CREDITS_OK),
      "/key": () => json({ error: { message: "No auth credentials found" } }, 401),
    });

    const verdict = seen(await checkCredits({ apiKey: API_KEY, model: PAID_MODEL, fetchFn }));

    expect(verdict).toEqual({ kind: "unknown", message: expect.stringMatching(/\/key.*401/) });
  });

  it("is unknown when the request throws (network error)", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError(`fetch failed for Bearer ${API_KEY}`);
    });

    const verdict = seen(await checkCredits({ apiKey: API_KEY, model: PAID_MODEL, fetchFn }));

    expect(verdict).toEqual({ kind: "unknown", message: expect.stringMatching(/\/credits.*TypeError/) });
  });

  it("is unknown when a body does not match the expected shape", async () => {
    const fetchFn = fakeFetch({
      "/credits": () => json({ data: { total_credits: "lots" } }),
      "/key": () => json(KEY_OK),
    });

    const verdict = seen(await checkCredits({ apiKey: API_KEY, model: PAID_MODEL, fetchFn }));

    expect(verdict).toEqual({ kind: "unknown", message: expect.stringContaining("/credits") });
  });

  it("is ok with the remaining balance when both endpoints answer", async () => {
    const fetchFn = fakeFetch({
      "/credits": () => json(CREDITS_OK),
      "/key": () => json({ data: { ...KEY_OK.data, limit: 5, limit_remaining: 3 } }),
    });

    const verdict = seen(
      await checkCredits({ apiKey: API_KEY, model: PAID_MODEL, fetchFn, baseUrl: "https://example.test/api/v1" }),
    );

    expect(verdict).toEqual({ kind: "ok", remaining: 7.5, keyLimitRemaining: 3 });
    expect(fetchFn).toHaveBeenCalledWith("https://example.test/api/v1/credits", {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    expect(formatVerdict(verdict)).toMatch(/^OpenRouter pre-flight: .*7\.50.*3\.00/);
  });
});

describe("formatVerdict", () => {
  it("phrases unknown as a warning that the run continues", () => {
    expect(formatVerdict({ kind: "unknown", message: "GET /key failed: HTTP 500" })).toMatch(
      /^OpenRouter pre-flight: warning.*continuing/,
    );
  });
});

// Runs last (tests in a file run in order): it sees every verdict collected above.
describe("no key leak", () => {
  it("keeps the API key out of every message, reason and formatted line above", () => {
    expect(verdicts).toHaveLength(9);
    for (const verdict of verdicts) {
      expect(JSON.stringify(verdict)).not.toContain(API_KEY);
      expect(formatVerdict(verdict)).not.toContain(API_KEY);
    }
  });
});
