import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { isProjectPaused, withPauseDetection } from "./supabase-paused";

// Any syntactically valid JWT makes getUser(jwt) call the Auth API.
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig";

// A fetch stub that always answers with the given body and status.
function respond(body: string, status: number, contentType = "text/html"): typeof fetch {
  return () => Promise.resolve(new Response(body, { status, headers: { "Content-Type": contentType } }));
}

const pausedFetch = respond("<html><body>Project Paused</body></html>", 540);

function client(fetchImpl: typeof fetch) {
  return createClient("http://localhost:54321", "anon", {
    global: { fetch: fetchImpl },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const credentials = { email: "owner@example.com", password: "secret" };

describe("supabase-js behaviour on HTTP 540 (observed)", () => {
  it("loses the status for Auth calls without the fetch wrapper", async () => {
    const { error } = await client(pausedFetch).auth.getUser(JWT);
    expect(error?.name).toBe("AuthUnknownError");
    expect(error?.status).toBeUndefined();
    expect(isProjectPaused(error)).toBe(false);
  });

  it("keeps the status on the PostgREST response, error carries only the body", async () => {
    const result = await client(pausedFetch).rpc("keepalive_status");
    expect(result.status).toBe(540);
    expect(isProjectPaused(result)).toBe(true);
  });
});

describe("isProjectPaused with the app's fetch wrapper", () => {
  const paused = client(withPauseDetection(pausedFetch));

  it("recognises auth.getUser()", async () => {
    const { error } = await paused.auth.getUser(JWT);
    expect(error?.status).toBe(540);
    expect(isProjectPaused(error)).toBe(true);
  });

  it("recognises auth.signInWithPassword()", async () => {
    const { error } = await paused.auth.signInWithPassword(credentials);
    expect(error?.status).toBe(540);
    expect(isProjectPaused(error)).toBe(true);
  });

  it("recognises .rpc() by its error and by its response", async () => {
    const result = await paused.rpc("keepalive_status");
    expect(isProjectPaused(result.error)).toBe(true);
    expect(isProjectPaused(result)).toBe(true);
  });

  it("does not flag invalid credentials (400)", async () => {
    const invalid = client(
      withPauseDetection(
        respond(
          JSON.stringify({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }),
          400,
          "application/json",
        ),
      ),
    );
    const { error } = await invalid.auth.signInWithPassword(credentials);
    expect(error?.code).toBe("invalid_credentials");
    expect(isProjectPaused(error)).toBe(false);
  });

  it("does not flag network failures", async () => {
    const offline = client(withPauseDetection(() => Promise.reject(new TypeError("fetch failed"))));
    expect(isProjectPaused((await offline.auth.getUser(JWT)).error)).toBe(false);
    expect(isProjectPaused((await offline.auth.signInWithPassword(credentials)).error)).toBe(false);
    const rpc = await offline.rpc("keepalive_status");
    expect(isProjectPaused(rpc.error)).toBe(false);
    expect(isProjectPaused(rpc)).toBe(false);
  });

  it("does not flag other server errors (502)", async () => {
    const gateway = client(withPauseDetection(respond("bad gateway", 502, "text/plain")));
    expect(isProjectPaused((await gateway.auth.getUser(JWT)).error)).toBe(false);
    const rpc = await gateway.rpc("keepalive_status");
    expect(isProjectPaused(rpc.error)).toBe(false);
    expect(isProjectPaused(rpc)).toBe(false);
  });

  it("ignores non-objects", () => {
    expect(isProjectPaused(null)).toBe(false);
    expect(isProjectPaused(undefined)).toBe(false);
    expect(isProjectPaused("540")).toBe(false);
  });
});
