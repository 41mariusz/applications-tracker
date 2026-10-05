// risk: #3 (test-plan.md) — reverting a terminal status must ask the owner first: cancelling sends
// nothing and leaves the status and history as they were; accepting records the revert in history.
// Only a browser sees the confirm dialog (plan: context/changes/testing-status-rules-end-to-end, Phase 4).
// Modelled on call-phone-search.spec.ts. Real boundaries: auth, SSR details page, React island, DB.
import { test, expect, type Dialog } from "@playwright/test";
import { deleteApplication } from "./support/local-admin";

test.describe("risk #3: reverting a terminal status in the browser", () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }, testInfo) => {
    // Remove whatever was created, each delete independently: one failure must not strand the others.
    const ids = createdIds.splice(0);
    const results = await Promise.allSettled(ids.map((id) => deleteApplication(request, id)));
    const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${ids[i]}: ${String(r.reason)}`] : []));
    expect(failed, "every application created by the test must be deleted").toEqual([]);
    // The application only exists when the body got past setup; a failed test keeps its own error.
    if (testInfo.status === testInfo.expectedStatus) {
      expect(ids, "the application created by the test must be cleaned up").toHaveLength(1);
    }
  });

  test("cancelling the revert dialog sends nothing; accepting it records Odrzucona → Oferta as a revert", async ({
    page,
    baseURL,
  }) => {
    // Setup: one application (status "sent"), closed as rejected through the app API.
    const tag = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
    const company = `[E2E] Revert ${tag}`;
    const origin = new URL(baseURL ?? "").origin;
    const res = await page.request.post("/api/applications", {
      headers: { Origin: origin },
      form: { company, position: "Developer" },
    });
    expect(res.status()).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    createdIds.push(id);
    test.info().annotations.push({ type: "test-data", description: company });
    const statusRoute = `/api/applications/${id}/status`;
    const closed = await page.request.post(statusRoute, { headers: { Origin: origin }, form: { status: "rejected" } });
    await expect(closed).toBeOK();

    // Every POST the page itself makes to the status route from here on (attached after the setup POSTs).
    const posts: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && new URL(req.url()).pathname === statusRoute) posts.push(req.url());
    });

    await page.goto(`/applications/${id}`);
    const select = page.getByLabel("Zmień status");
    const currentStatus = select.locator("option:checked");
    const history = page.getByTestId("history");
    await expect(currentStatus).toHaveText("Odrzucona");
    await expect(history).toContainText("Wysłana → Odrzucona");
    await expect(history).not.toContainText("(cofnięcie)");

    // Picks "Oferta" until the island has hydrated and the dialog shows. A retry never picks again
    // once a dialog was seen, and nothing-sent is checked first in every attempt, so a POST without
    // a dialog fails on that assertion instead of being retried away.
    const pickOfferUntilDialog = async (dialogs: string[]) => {
      await expect(async () => {
        expect(posts, "nothing may be sent to the status route before the owner confirms").toEqual([]);
        if (dialogs.length === 0) await select.selectOption("offer", { timeout: 2_000 });
        expect(posts, "nothing may be sent to the status route before the owner confirms").toEqual([]);
        expect(dialogs, "picking a revert target asks for confirmation").toHaveLength(1);
      }).toPass({ timeout: 15_000 });
    };
    const handle = (dialogs: string[], answer: (d: Dialog) => Promise<void>) => (d: Dialog) => {
      dialogs.push(d.message());
      void answer(d);
    };
    const revertText = "Cofnąć status „Odrzucona” na „Oferta”? Zmiana zostanie zapisana w historii.";

    // 1. The owner cancels: the dialog names the revert, nothing is sent, nothing changes.
    const dismissed: string[] = [];
    page.once(
      "dialog",
      handle(dismissed, (d) => d.dismiss()),
    );
    await pickOfferUntilDialog(dismissed);
    expect(dismissed[0]).toBe(revertText);
    await expect(select).toBeEnabled();
    await expect(page.getByText("Zapisywanie…")).toBeHidden();
    // The reload also gives any stray request time to surface before the check below.
    await page.reload();
    expect(posts, "cancelling the dialog sends nothing to the status route").toEqual([]);
    await expect(currentStatus).toHaveText("Odrzucona");
    await expect(history).toContainText("Wysłana → Odrzucona");
    await expect(history).not.toContainText("(cofnięcie)");

    // 2. The owner accepts: one POST, the page reloads with the new status and the revert in history.
    const accepted: string[] = [];
    page.once(
      "dialog",
      handle(accepted, (d) => d.accept()),
    );
    const sent = page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === statusRoute,
    );
    await expect(async () => {
      if (accepted.length === 0) await select.selectOption("offer", { timeout: 2_000 });
      expect(accepted, "picking a revert target asks for confirmation").toHaveLength(1);
    }).toPass({ timeout: 15_000 });
    expect(accepted[0]).toBe(revertText);
    expect((await sent).status(), "the revert is saved").toBe(200);
    const revert = history.getByRole("listitem").filter({ hasText: "Odrzucona → Oferta" });
    await expect(revert).toHaveCount(1);
    await expect(revert).toContainText("(cofnięcie)");
    await expect(currentStatus).toHaveText("Oferta");
    expect(posts, "accepting sends exactly one status change").toHaveLength(1);
  });
});
