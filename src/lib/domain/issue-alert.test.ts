import { describe, expect, it } from "vitest";
import { formatIssueAlert, MAX_ALERT_LENGTH, secretMatches } from "@/lib/domain/issue-alert";

const APP_URL = "https://applications-tracker.example.workers.dev";

// Shape of a Cloudflare Notifications generic-webhook payload (fields from the Cloudflare docs).
const docsExample = {
  name: "Workers issue",
  text: "New issue in applications-tracker: TypeError: Cannot read properties of undefined (reading 'id')",
  data: { script_name: "applications-tracker" },
  ts: 1759737600,
  account_id: "abc123",
  policy_id: "policy-1",
  policy_name: "Applications Tracker issues",
  alert_type: "workers_issue",
  alert_correlation_id: "corr-1",
  alert_event: "issue_created",
};

// "Save and Test" in the dashboard sends only a greeting text.
const saveAndTest = {
  text: "Hello World! This is a test message sent from https://cloudflare.com. If you can see this, your webhook is configured properly.",
};

describe("formatIssueAlert", () => {
  it("formats the documented payload", () => {
    const message = formatIssueAlert(docsExample, APP_URL);

    expect(message.startsWith("Błąd w aplikacji: Workers issue")).toBe(true);
    expect(message).toContain("Reguła: Applications Tracker issues");
    expect(message).toContain(docsExample.text);
    expect(message).toContain("Typ: workers_issue");
    expect(message).toContain("Zdarzenie: issue_created");
    // 2025-10-06 08:00 UTC is 10:00 in Warsaw (CEST)
    expect(message).toMatch(/Czas: .*10:00/);
    expect(message).toContain(`Aplikacja: ${APP_URL}`);
  });

  it("is still useful without text", () => {
    const { text: _text, ...withoutText } = docsExample;
    const message = formatIssueAlert(withoutText, APP_URL);

    expect(message.startsWith("Błąd w aplikacji")).toBe(true);
    expect(message).toContain("brak opisu");
    expect(message).toContain("Typ: workers_issue");
    expect(message).toContain(APP_URL);
  });

  it("handles an unknown shape", () => {
    for (const payload of [null, "oops", 42, [], { unexpected: true }]) {
      const message = formatIssueAlert(payload, APP_URL);
      expect(message.startsWith("Błąd w aplikacji")).toBe(true);
      expect(message).toContain(APP_URL);
    }
  });

  it("truncates an oversized text below Telegram's limit", () => {
    const message = formatIssueAlert({ ...docsExample, text: "x".repeat(10_000) }, APP_URL);
    expect(message.length).toBeLessThanOrEqual(MAX_ALERT_LENGTH);
    expect(message.startsWith("Błąd w aplikacji")).toBe(true);
  });

  it("formats the Save and Test request", () => {
    const message = formatIssueAlert(saveAndTest, APP_URL);
    expect(message.startsWith("Błąd w aplikacji")).toBe(true);
    expect(message).toContain("your webhook is configured properly");
  });
});

describe("secretMatches", () => {
  it("accepts the same secret", () => {
    expect(secretMatches("s3cret-value", "s3cret-value")).toBe(true);
  });

  it("rejects a different secret of the same length", () => {
    expect(secretMatches("s3cret-valuX", "s3cret-value")).toBe(false);
  });

  it("rejects a different length, including a prefix", () => {
    expect(secretMatches("s3cret", "s3cret-value")).toBe(false);
    expect(secretMatches("s3cret-value-and-more", "s3cret-value")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(secretMatches(null, "s3cret-value")).toBe(false);
    expect(secretMatches("", "s3cret-value")).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches("anything", "")).toBe(false);
  });
});
