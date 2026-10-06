import { describe, expect, it } from "vitest";
import {
  buildReport,
  classifyResponse,
  classifyThrown,
  clientErrorReportSchema,
  createReportGate,
  errorMessage,
  isNoise,
  MAX_REPORT_MESSAGE,
  NETWORK_MESSAGE,
  type ClientResult,
} from "./client-errors";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function html(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=UTF-8" } });
}

describe("classifyResponse", () => {
  it("returns the JSON body of a success", async () => {
    expect(await classifyResponse(json({ id: "a" }, 201))).toEqual({ kind: "ok", status: 201, data: { id: "a" } });
  });

  it("returns the bytes of a success in bytes mode", async () => {
    const result = await classifyResponse(new Response(new Uint8Array([1, 2, 3]), { status: 200 }), "bytes");
    expect(result.kind).toBe("ok");
    expect(result.kind === "ok" && new Uint8Array(result.data as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("keeps a route's JSON error message (validation, 401, a route's 500)", async () => {
    expect(await classifyResponse(json({ error: "Nieprawidłowy status." }, 400))).toEqual({
      kind: "http",
      status: 400,
      data: { error: "Nieprawidłowy status." },
    });
    expect((await classifyResponse(json({ error: "Nie udało się." }, 500))).kind).toBe("http");
    expect((await classifyResponse(json({ errors: { company: "Podaj nazwę firmy" } }, 400))).kind).toBe("http");
  });

  it("recognises the paused project (503 database_paused)", async () => {
    expect(await classifyResponse(json({ error: "database_paused" }, 503))).toEqual({ kind: "paused", status: 503 });
  });

  it("keeps an auth outage as an http result with its code", async () => {
    expect(await classifyResponse(json({ error: "auth_unavailable" }, 503))).toEqual({
      kind: "http",
      status: 503,
      data: { error: "auth_unavailable" },
    });
  });

  it("treats an HTML error page (Cloudflare 1101/1102) as a server error", async () => {
    expect(await classifyResponse(html("<html>Error 1102</html>", 503))).toEqual({ kind: "server", status: 503 });
  });

  it("treats an empty 500 as a server error", async () => {
    expect(await classifyResponse(new Response(null, { status: 500 }))).toEqual({ kind: "server", status: 500 });
  });

  it("treats a JSON content type with an unparsable body as a server error", async () => {
    const res = new Response("{truncated", { status: 502, headers: { "Content-Type": "application/json" } });
    expect(await classifyResponse(res)).toEqual({ kind: "server", status: 502 });
  });
});

describe("classifyThrown", () => {
  it("is a network failure when fetch rejects", () => {
    expect(classifyThrown(new TypeError("Failed to fetch"))).toEqual({
      kind: "network",
      name: "TypeError",
      message: "Failed to fetch",
    });
  });

  it("is aborted when the signal was aborted or the error is an AbortError", () => {
    const controller = new AbortController();
    controller.abort();
    expect(classifyThrown(new TypeError("x"), controller.signal)).toEqual({ kind: "aborted" });
    expect(classifyThrown(new DOMException("The operation was aborted.", "AbortError"))).toEqual({ kind: "aborted" });
  });
});

describe("errorMessage", () => {
  const fallback = "Nie udało się zapisać.";

  it("tells a network failure apart from a server error", () => {
    expect(errorMessage({ kind: "network", name: "TypeError", message: "" }, fallback)).toEqual({
      text: NETWORK_MESSAGE,
    });
    expect(errorMessage({ kind: "server", status: 503 }, fallback)).toEqual({
      text: "Błąd serwera (503). Spróbuj ponownie za chwilę.",
    });
  });

  it("links the paused message to /paused", () => {
    const message = errorMessage({ kind: "paused", status: 503 }, fallback);
    expect(message.href).toBe("/paused");
    expect(message.text).not.toBe(NETWORK_MESSAGE);
  });

  it("shows the server's message, or the fallback without one", () => {
    expect(errorMessage({ kind: "http", status: 400, data: { error: "Nieprawidłowy status." } }, fallback)).toEqual({
      text: "Nieprawidłowy status.",
    });
    expect(errorMessage({ kind: "http", status: 404, data: {} }, fallback)).toEqual({ text: fallback });
  });

  it("translates middleware codes and links 401 to sign-in", () => {
    expect(errorMessage({ kind: "http", status: 503, data: { error: "auth_unavailable" } }, fallback).text).toMatch(
      /Logowanie jest chwilowo niedostępne/,
    );
    expect(errorMessage({ kind: "http", status: 503, data: { error: "misconfigured" } }, fallback).text).toMatch(
      /źle skonfigurowana/,
    );
    expect(errorMessage({ kind: "http", status: 401, data: { error: "Zaloguj się ponownie." } }, fallback)).toEqual({
      text: "Zaloguj się ponownie.",
      href: "/auth/signin",
      linkLabel: "Zaloguj się",
    });
  });

  it("falls back for results that carry no message", () => {
    const results: ClientResult[] = [{ kind: "aborted" }, { kind: "ok", status: 200, data: null }];
    for (const result of results) expect(errorMessage(result, fallback)).toEqual({ text: fallback });
  });
});

describe("isNoise", () => {
  const origin = "https://app.example";

  it("ignores ResizeObserver notices, cancellations and masked cross-origin errors", () => {
    expect(isNoise({ message: "ResizeObserver loop completed with undelivered notifications." })).toBe(true);
    expect(isNoise({ name: "AbortError", message: "The user aborted a request." })).toBe(true);
    expect(isNoise({ message: "Script error." })).toBe(true);
  });

  it("ignores errors from extensions and other origins' scripts", () => {
    expect(isNoise({ message: "x", filename: "chrome-extension://abc/content.js" })).toBe(true);
    expect(isNoise({ message: "x", stack: "at f (moz-extension://abc/inject.js:1:1)" })).toBe(true);
    expect(isNoise({ message: "x", filename: "https://ads.example/tag.js" }, origin)).toBe(true);
  });

  it("keeps the app's own errors", () => {
    expect(isNoise({ message: "Cannot read properties of undefined", filename: `${origin}/_astro/a.js` }, origin)).toBe(
      false,
    );
    expect(isNoise({ name: "TypeError", message: "x is not a function" })).toBe(false);
  });
});

describe("buildReport", () => {
  it("keeps only the path, the error's name and a truncated message", () => {
    const report = buildReport({
      kind: "error",
      op: "window.error",
      error: new TypeError("y".repeat(MAX_REPORT_MESSAGE + 50)),
      path: "/dashboard?q=Anna%20Kowalska#top",
    });
    expect(report.path).toBe("/dashboard");
    expect(report.name).toBe("TypeError");
    expect(report.message).toHaveLength(MAX_REPORT_MESSAGE);
    expect(report.message.endsWith("…")).toBe(true);
    expect(clientErrorReportSchema.safeParse(report).success).toBe(true);
  });

  it("reads non-Error rejections without the object's other fields", () => {
    expect(buildReport({ kind: "rejection", op: "window.unhandledrejection", error: "boom", path: "/" })).toMatchObject(
      { name: "string", message: "boom" },
    );
    const report = buildReport({ kind: "rejection", op: "x", error: { name: "Custom", message: "m" }, path: "/" });
    expect(report).toMatchObject({ name: "Custom", message: "m" });
  });

  it("carries status, component URL (without query) and the CV context", () => {
    const report = buildReport({
      kind: "hydration",
      op: "astro.hydration",
      error: new Error("chunk"),
      status: 503,
      path: "/cv",
      componentUrl: "/_astro/CvLibrary.abc.js?v=1",
      entityId: "00000000-0000-4000-8000-000000000031",
      mimeType: "application/pdf",
    });
    expect(report).toMatchObject({
      status: 503,
      componentUrl: "/_astro/CvLibrary.abc.js",
      entityId: "00000000-0000-4000-8000-000000000031",
      mimeType: "application/pdf",
    });
  });
});

describe("clientErrorReportSchema", () => {
  const valid = { kind: "test", op: "manual", name: "Error", message: "proof", path: "/dashboard" };

  it("accepts the test report used as production proof", () => {
    expect(clientErrorReportSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses an unknown kind, a long message and a path that is not the app's", () => {
    expect(clientErrorReportSchema.safeParse({ ...valid, kind: "spam" }).success).toBe(false);
    expect(clientErrorReportSchema.safeParse({ ...valid, message: "x".repeat(301) }).success).toBe(false);
    expect(clientErrorReportSchema.safeParse({ ...valid, path: "https://evil.example/" }).success).toBe(false);
  });
});

describe("createReportGate", () => {
  const report = buildReport({ kind: "error", op: "window.error", error: new Error("a"), path: "/" });

  it("sends the same failure once", () => {
    const allow = createReportGate();
    expect(allow(report)).toBe(true);
    expect(allow({ ...report })).toBe(false);
  });

  it("stops after the per-page limit", () => {
    const allow = createReportGate(5);
    const sent = Array.from({ length: 8 }, (_, i) => allow({ ...report, message: `m${String(i)}` }));
    expect(sent.filter(Boolean)).toHaveLength(5);
  });
});
