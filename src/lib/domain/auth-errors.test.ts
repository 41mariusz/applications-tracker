import { describe, expect, it } from "vitest";
import { classifyAuthError, isInvalidCredentials } from "@/lib/domain/auth-errors";

// Literal shapes copying the auth-js 2.116 error classes (lib/errors.js): every AuthError carries
// `__isAuthError`, and the guards dispatch on `name`.
function authError(name: string, status: number | undefined, code?: string) {
  return { __isAuthError: true, name, message: name, status, code };
}

const sessionMissing = authError("AuthSessionMissingError", 400);
const networkFailure = authError("AuthRetryableFetchError", 0);
const auth503 = authError("AuthRetryableFetchError", 503);
const unknown = authError("AuthUnknownError", undefined);
const badJwt = authError("AuthApiError", 401, "bad_jwt");
const refreshUsed = authError("AuthApiError", 400, "refresh_token_already_used");
const paused = authError("AuthApiError", 540, "project_paused");
const invalidCredentials = authError("AuthApiError", 400, "invalid_credentials");

describe("classifyAuthError", () => {
  it("is none without an error", () => {
    expect(classifyAuthError(null)).toBe("none");
    expect(classifyAuthError(undefined)).toBe("none");
  });

  it("treats a missing session as quietly signed out", () => {
    expect(classifyAuthError(sessionMissing)).toBe("no-session");
  });

  it("treats a network failure and an Auth 5xx as an outage", () => {
    expect(classifyAuthError(networkFailure)).toBe("outage");
    expect(classifyAuthError(auth503)).toBe("outage");
  });

  it("treats an unrecognised Auth reply as an outage", () => {
    expect(classifyAuthError(unknown)).toBe("outage");
  });

  it("treats a bad JWT and a reused refresh token as rejected", () => {
    expect(classifyAuthError(badJwt)).toBe("rejected");
    expect(classifyAuthError(refreshUsed)).toBe("rejected");
  });

  it("recognises a paused project before anything else", () => {
    expect(classifyAuthError(paused)).toBe("paused");
  });

  it("treats a non-Auth error as an outage", () => {
    expect(classifyAuthError(new Error("boom"))).toBe("outage");
  });
});

describe("isInvalidCredentials", () => {
  it("is true only for invalid_credentials", () => {
    expect(isInvalidCredentials(invalidCredentials)).toBe(true);
    expect(isInvalidCredentials(refreshUsed)).toBe(false);
    expect(isInvalidCredentials(auth503)).toBe(false);
    expect(isInvalidCredentials(sessionMissing)).toBe(false);
    expect(isInvalidCredentials(null)).toBe(false);
  });
});
