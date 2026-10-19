// PRD FR-004 (update 2026-10-19): only a crossed-out application can be deleted permanently, and only after
// the owner confirms. Only a browser sees the details page's control and its confirm dialog
// (plan: context/changes/delete-closed-applications, Phase 3). Real boundaries: auth, SSR, React island, DB.
import { test, expect, type Dialog } from "@playwright/test";
import { deleteApplication } from "./support/local-admin";

test.describe("deleting a crossed-out application in the browser", () => {
  let createdId: string | null = null;

  test.afterEach(async ({ request }) => {
    // The test deletes its application itself on success; clean up only if it is still there.
    const id = createdId;
    createdId = null;
    if (!id) return;
    const res = await request.get(`/api/applications/${id}`, { failOnStatusCode: false });
    if (res.status() !== 404) await deleteApplication(request, id);
  });

  test("no control while active; once withdrawn, cancelling keeps it and confirming deletes it", async ({
    page,
    baseURL,
  }) => {
    const tag = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
    const company = `[E2E] Delete ${tag}`;
    const origin = new URL(baseURL ?? "").origin;
    const res = await page.request.post("/api/applications", {
      headers: { Origin: origin },
      form: { company, position: "Developer" },
    });
    expect(res.status()).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    createdId = id;
    test.info().annotations.push({ type: "test-data", description: company });

    // Active: no delete control on the details page.
    await page.goto(`/applications/${id}`);
    await expect(page.getByTestId("call-summary")).toContainText(company);
    await expect(page.getByTestId("delete-application")).toHaveCount(0);

    // Crossed out (Withdrawn): the control appears.
    const closed = await page.request.post(`/api/applications/${id}/status`, {
      headers: { Origin: origin },
      form: { status: "withdrawn" },
    });
    await expect(closed).toBeOK();
    await page.goto(`/applications/${id}`);
    const button = page.getByTestId("delete-application");
    await expect(button).toHaveText("Usuń trwale");

    // Clicks until the island has hydrated and the confirm dialog shows (a click before hydration does nothing).
    const clickUntilDialog = async (dialogs: string[]) => {
      await expect(async () => {
        if (dialogs.length === 0) await button.click({ timeout: 2_000 });
        expect(dialogs, "deleting asks for confirmation").toHaveLength(1);
      }).toPass({ timeout: 15_000 });
    };
    const handle = (dialogs: string[], answer: (d: Dialog) => Promise<void>) => (d: Dialog) => {
      dialogs.push(d.message());
      void answer(d);
    };

    // Cancel: nothing is deleted, the page stays.
    const dismissed: string[] = [];
    const dismiss = handle(dismissed, (d) => d.dismiss());
    page.on("dialog", dismiss);
    await clickUntilDialog(dismissed);
    page.off("dialog", dismiss);
    expect(dismissed[0]).toContain(company);
    expect(dismissed[0]).toContain("Plik CV zostanie w bibliotece");
    await expect(page).toHaveURL(new RegExp(`/applications/${id}$`));
    expect((await page.request.get(`/applications/${id}`)).status()).toBe(200);

    // Confirm: deleted, back on the list, the company gone.
    const accepted: string[] = [];
    const accept = handle(accepted, (d) => d.accept());
    page.on("dialog", accept);
    await clickUntilDialog(accepted);
    await expect(page).toHaveURL(/\/dashboard$/);
    page.off("dialog", accept);
    await expect(page.getByText(company)).toHaveCount(0);
    expect((await page.request.get(`/applications/${id}`, { failOnStatusCode: false })).status()).toBe(404);
  });
});
