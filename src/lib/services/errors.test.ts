import { describe, expect, it } from "vitest";
import { toServiceError } from "./errors";
import { isProjectPaused } from "@/lib/supabase-paused";

const postgrestError = { message: 'column "nope" does not exist', code: "42703", details: null, hint: "Perhaps…" };

describe("toServiceError", () => {
  it("names the operation in the message and keeps a stack", () => {
    const error = toServiceError("applications.list", { error: postgrestError, status: 400 });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('applications.list: column "nope" does not exist');
    expect(error.stack).toContain("applications.list");
  });

  it("keeps code, details, hint and the result's HTTP status in cause", () => {
    const error = toServiceError("applications.list", { error: postgrestError, status: 400 });
    expect(error.cause).toMatchObject({
      message: 'column "nope" does not exist',
      code: "42703",
      details: null,
      hint: "Perhaps…",
      status: 400,
    });
  });

  it("copies name and message of an Error instance (not enumerable)", () => {
    class StorageApiError extends Error {
      status = 403;
      constructor(message: string) {
        super(message);
        this.name = "StorageApiError";
      }
    }
    const error = toServiceError("cv.download", { error: new StorageApiError("denied") });
    expect(error.message).toBe("cv.download: denied");
    expect(error.cause).toMatchObject({ name: "StorageApiError", message: "denied", status: 403 });
  });

  it("prefers the result's status over the error's", () => {
    const error = toServiceError("op", { error: { message: "x", status: 1 }, status: 500 });
    expect((error.cause as { status: number }).status).toBe(500);
  });

  it("handles a non-object error", () => {
    const error = toServiceError("op", { error: "boom" });
    expect(error.message).toBe("op: boom");
  });

  it("keeps a paused project recognisable", () => {
    const paused = toServiceError("applications.list", {
      error: { code: "project_paused", message: "p" },
      status: 540,
    });
    expect(isProjectPaused(paused)).toBe(true);
    expect(isProjectPaused(toServiceError("op", { error: postgrestError, status: 400 }))).toBe(false);
  });
});
