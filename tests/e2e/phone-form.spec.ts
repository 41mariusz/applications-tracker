// S-07 (roadmap M-2): the application form on a 360 px phone. Right after a call the owner adds or
// edits an application on the phone: nothing may scroll sideways, every control and both actions are
// thumb-sized (40 px, from form-classes.ts), an empty submit lands on "Firma" with a summary above the
// buttons, a filled form saves to the list, and a bad edit link is a 404 card, not a crash
// (plan: context/changes/phone-friendly-form, Phase 4). Real boundaries: auth, SSR page, React island, DB.
import { test, expect, type Page } from "@playwright/test";
import { deleteApplication } from "./support/local-admin";

test.use({ viewport: { width: 360, height: 740 } });

// Labels of the ten fields, in form order (the required ones carry " *").
const FIELD_LABELS = [
  "Firma *",
  "Stanowisko *",
  "Link do ogłoszenia",
  "Widełki z ogłoszenia",
  "Moja podana stawka",
  "Kontakt HR — imię i nazwisko",
  "Kontakt HR — telefon",
  "Data aplikowania",
  "Forma zatrudnienia",
  "Tryb pracy",
];

// The application form only: the Topbar has its own <form> ("Wyloguj"), which is out of scope.
const applicationForm = (page: Page) =>
  page.locator("form").filter({ has: page.getByRole("button", { name: "Zapisz" }) });

// Opens the new-application page and waits for the island: the submit stays disabled until hydration.
async function openNewForm(page: Page) {
  await page.goto("/applications/new");
  const form = applicationForm(page);
  await expect(form.getByRole("button", { name: "Zapisz" })).toBeEnabled();
  return form;
}

test.describe("S-07: application form on a 360 px phone", () => {
  test("no sideways scroll; every field, Zapisz and Anuluj at least 40 px tall", async ({ page }) => {
    const form = await openNewForm(page);

    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll, "the page must not scroll sideways at 360 px").toBeLessThanOrEqual(width.client);

    const targets = [
      ...FIELD_LABELS.map((label) => ({ name: label, locator: form.getByLabel(label, { exact: true }) })),
      { name: "Zapisz", locator: form.getByRole("button", { name: "Zapisz" }) },
      { name: "Anuluj", locator: form.getByRole("link", { name: "Anuluj" }) },
    ];
    for (const { name, locator } of targets) {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (!box) throw new Error(`${name}: must be rendered`);
      expect(box.height, `${name}: at least 40 px tall`).toBeGreaterThanOrEqual(40);
    }
  });

  test("an empty submit focuses Firma and shows the summary above the buttons", async ({ page }) => {
    const form = await openNewForm(page);
    await form.getByRole("button", { name: "Zapisz" }).click();
    await expect(form.getByText("Popraw zaznaczone pola.")).toBeVisible();
    await expect(form.getByLabel("Firma *", { exact: true })).toBeFocused();
  });

  test("the edit page of a malformed or unknown id is a 404 card", async ({ page }) => {
    for (const id of ["abc", crypto.randomUUID()]) {
      const res = await page.goto(`/applications/${id}/edit`);
      expect(res?.status(), `${id}: edit page answers 404`).toBe(404);
      await expect(page.getByTestId("not-found")).toBeVisible();
      await expect(page.getByTestId("not-found")).toContainText("Nie znaleziono");
    }
  });
});

test.describe("S-07: saving the application form on a 360 px phone", () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }, testInfo) => {
    // Remove whatever was created, each delete independently: one failure must not strand the others.
    const ids = createdIds.splice(0);
    const results = await Promise.allSettled(ids.map((id) => deleteApplication(request, id)));
    const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${ids[i]}: ${String(r.reason)}`] : []));
    expect(failed, "every application created by the test must be deleted").toEqual([]);
    // The application only exists when the body got past saving; a failed test keeps its own error.
    if (testInfo.status === testInfo.expectedStatus) {
      expect(ids, "the application created by the test must be cleaned up").toHaveLength(1);
    }
  });

  test("filling company and position saves and lands on the list with the new card", async ({ page }) => {
    const tag = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
    const company = `[E2E] Form ${tag}`;
    test.info().annotations.push({ type: "test-data", description: company });

    const form = await openNewForm(page);
    await form.getByLabel("Firma *", { exact: true }).fill(company);
    await form.getByLabel("Stanowisko *", { exact: true }).fill("Frontend Developer");
    await form.getByRole("button", { name: "Zapisz" }).click();

    // The card on the list is the contract; its link names the id that cleanup deletes.
    await page.waitForURL("**/dashboard");
    const link = page.getByRole("link", { name: company, exact: true });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    const id = /^\/applications\/([0-9a-f-]{36})$/.exec(href ?? "")?.[1];
    if (!id) throw new Error(`the new card must link to /applications/<id>, got ${String(href)}`);
    createdIds.push(id);
    await expect(link).toHaveCount(1);
  });
});
