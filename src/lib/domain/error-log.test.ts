import { describe, expect, it } from "vitest";
import { formatErrorLine, MAX_DETAILS_LENGTH, MAX_MESSAGE_LENGTH, MAX_STACK_LENGTH } from "@/lib/domain/error-log";

const base = {
  route: "/applications/[id]",
  method: "GET",
  path: "/applications/123",
  version: "v-1",
};

describe("formatErrorLine", () => {
  it("serialises an Error with its cause chain", () => {
    const error = new Error("render failed", { cause: new TypeError("fetch failed") });
    const line = formatErrorLine({ ...base, status: 500, userId: "u-1", error });

    expect(line).toMatchObject({
      level: "error",
      route: "/applications/[id]",
      method: "GET",
      path: "/applications/123",
      status: 500,
      userId: "u-1",
      version: "v-1",
      error: { name: "Error", message: "render failed", cause: { name: "TypeError", message: "fetch failed" } },
    });
    const serialized = line.error as { stack?: string; cause?: { stack?: string } };
    expect(serialized.stack).toContain("render failed");
    expect(serialized.cause?.stack).toContain("fetch failed");
  });

  it("serialises a PostgREST-style plain object", () => {
    const line = formatErrorLine({
      ...base,
      op: "getApplication",
      error: { code: "42501", message: "permission denied", details: "row-level security", hint: "check RLS" },
    });

    expect(line.op).toBe("getApplication");
    expect(line.error).toEqual({
      name: "Object",
      message: "permission denied",
      code: "42501",
      details: "row-level security",
      hint: "check RLS",
    });
  });

  it("serialises a thrown string", () => {
    expect(formatErrorLine({ ...base, error: "boom" }).error).toEqual({ name: "string", message: "boom" });
  });

  it("leaves the error out when there is none (a 5xx response without a throw)", () => {
    const line = formatErrorLine({ ...base, status: 503, error: undefined });
    expect(line).not.toHaveProperty("error");
    expect(line.status).toBe(503);
  });

  it("strips the query string and fragment from the path", () => {
    expect(formatErrorLine({ ...base, path: "/dashboard?q=Anna%20Kowalska#top" }).path).toBe("/dashboard");
  });

  it("truncates the message, the stack and the details", () => {
    const error = new Error("m".repeat(MAX_MESSAGE_LENGTH + 100));
    error.stack = "s".repeat(MAX_STACK_LENGTH + 100);
    Object.assign(error, { details: "d".repeat(MAX_DETAILS_LENGTH + 100) });
    const serialized = formatErrorLine({ ...base, error }).error as { message: string; stack: string; details: string };

    expect(serialized.message.length).toBe(MAX_MESSAGE_LENGTH + 1);
    expect(serialized.stack.length).toBe(MAX_STACK_LENGTH + 1);
    expect(serialized.details.length).toBe(MAX_DETAILS_LENGTH + 1);
  });

  it("never adds an email field, even when the error carries one in details", () => {
    const error = { message: "duplicate", email: "owner@example.com", details: "Key (email)=(owner@example.com)" };
    const line = formatErrorLine({ ...base, userId: "u-1", error });
    const serialized = line.error as Record<string, unknown>;

    expect(line).not.toHaveProperty("email");
    expect(serialized).not.toHaveProperty("email");
    // details is truncated, not scrubbed
    expect(serialized.details).toBe("Key (email)=(owner@example.com)");
  });

  it("omits a missing user id", () => {
    expect(formatErrorLine({ ...base, userId: null })).not.toHaveProperty("userId");
  });
});
