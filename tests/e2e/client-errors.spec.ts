// production-error-visibility Phase 4 — a non-JSON server answer (e.g. a Cloudflare 1101/1102 HTML page)
// must read as a server error, not as "no connection", and must be reported to /api/client-error.
// Pattern of status-revert.spec.ts. Real boundaries: auth, SSR details page, React island, the report endpoint;
// only the status POST is answered by the test.
import { test, expect } from "@playwright/test";
import { deleteApplication } from "./support/local-admin";

test.describe("browser failure channel", () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }) => {
    const ids = createdIds.splice(0);
    const results = await Promise.allSettled(ids.map((id) => deleteApplication(request, id)));
    const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${ids[i]}: ${String(r.reason)}`] : []));
    expect(failed, "every application created by the test must be deleted").toEqual([]);
  });

  test("an HTML 503 on a status change shows the server error and sends a report", async ({ page, baseURL }) => {
    const tag = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
    const company = `[E2E] Server error ${tag}`;
    const origin = new URL(baseURL ?? "").origin;
    const res = await page.request.post("/api/applications", {
      headers: { Origin: origin },
      form: { company, position: "Developer" },
    });
    expect(res.status()).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    createdIds.push(id);
    test.info().annotations.push({ type: "test-data", description: company });

    // The Worker died mid-request: Cloudflare answers with its own HTML page instead of the app's JSON.
    const statusRoute = `/api/applications/${id}/status`;
    await page.route(`**${statusRoute}`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "text/html; charset=UTF-8",
        body: "<!doctype html><title>Worker exceeded resource limits</title><h1>Error 1102</h1>",
      }),
    );
    const report = page.waitForRequest(
      (req) => req.method() === "POST" && new URL(req.url()).pathname === "/api/client-error",
    );

    await page.goto(`/applications/${id}`);
    const select = page.getByLabel("Zmień status");
    const alert = page.getByRole("alert").filter({ hasText: "Błąd serwera" });
    // Picks "Kontakt HR" until the island has hydrated and the (intercepted) request has failed.
    await expect(async () => {
      await select.selectOption("hr_contact", { timeout: 2_000 });
      await expect(alert).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    await expect(alert).toContainText("Błąd serwera (503). Spróbuj ponownie za chwilę.");
    await expect(page.getByText("Brak połączenia")).toHaveCount(0);

    const sent = await report;
    const body = JSON.parse(sent.postData() ?? "{}") as Record<string, unknown>;
    expect(body).toMatchObject({ kind: "server", op: "application.status", status: 503, path: `/applications/${id}` });
    // The status did not change: the page still shows the original one after a reload.
    await page.unroute(`**${statusRoute}`);
    await page.reload();
    await expect(select.locator("option:checked")).toHaveText("Wysłana");
  });
});
