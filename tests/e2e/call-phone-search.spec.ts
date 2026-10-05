// risk: #1 (test-plan.md) — during an HR call, searching by a phone number typed in another
// format than stored must show the right application live, with the call info on its page.
// Typed key by key: the offer must stay on the list at every keystroke, not only at the end
// (plan: context/changes/testing-call-scenario-browser, Phase 2).
// Modelled on seed.spec.ts. Real boundaries: auth, routing, SSR list, live filter script, DB.
import { test, expect } from "@playwright/test";
import { deleteApplication } from "./support/local-admin";

test.describe("risk #1: phone search during a call", () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }, testInfo) => {
    // Remove whatever was created, each delete independently: one failure must not strand the others.
    const ids = createdIds.splice(0);
    const results = await Promise.allSettled(ids.map((id) => deleteApplication(request, id)));
    const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${ids[i]}: ${String(r.reason)}`] : []));
    expect(failed, "every application created by the test must be deleted").toEqual([]);
    // Both offers (the match and the decoy) only exist when the body got past setup; a failed test
    // keeps its own error instead of gaining this one.
    if (testInfo.status === testInfo.expectedStatus) {
      expect(ids, "both applications created by the test must be cleaned up").toHaveLength(2);
    }
  });

  test("a number typed key by key as 48 without + keeps the offer stored with dashes listed and shows the call info", async ({
    page,
    baseURL,
  }) => {
    // Setup: the offer whose HR phone is stored as 5xx-xxx-xxx (unique per run), and a decoy with
    // another number, so the list has something the live filter must hide.
    const digits = String(500_000_000 + Math.floor(Math.random() * 400_000_000));
    const decoyDigits = String(Number(digits) + 1);
    const stored = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    const typed = `48 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    // Labels carry a letters-only tag: search also matches company names, so digits in a label would
    // let an offer match by name instead of by phone.
    const tag = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
    const company = `[E2E] Call ${tag}`;
    const decoy = `[E2E] Decoy ${tag}`;
    const origin = new URL(baseURL ?? "").origin;
    const create = async (form: Record<string, string>) => {
      const res = await page.request.post("/api/applications", { headers: { Origin: origin }, form });
      expect(res.status()).toBe(201);
      createdIds.push(((await res.json()) as { id: string }).id);
    };
    await create({
      company,
      position: "Senior Developer",
      salary_range: "17-23k",
      quoted_rate: "21k",
      hr_contact_phone: stored,
    });
    await create({ company: decoy, position: "Developer", hr_contact_phone: decoyDigits });
    const applicationId = createdIds[0];
    test.info().annotations.push({ type: "test-data", description: `${company}; ${decoy}` });

    // Before typing, both offers are on the list.
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: decoy })).toBeVisible();

    // The recruiter calls: the owner types the number as it is read out, country code without "+".
    // After every key the offer is still on the list and "nothing found" never shows.
    const search = page.getByRole("searchbox", { name: "Szukaj" });
    const offer = page.getByRole("link", { name: company });
    const nothingFound = page.getByText("Brak wyników");
    for (const key of typed) {
      await search.pressSequentially(key);
      await expect(offer, `after typing "${await search.inputValue()}"`).toBeVisible();
      await expect(nothingFound).toBeHidden();
    }

    // Live filter: with the whole number typed, exactly this offer is left, without a page load.
    await expect(search).toHaveValue(typed);
    await expect(page.getByRole("link", { name: decoy })).toBeHidden();
    await expect(page.getByTestId("search-count")).toHaveText("1");

    // Opening it shows what the call needs: the salary range and the rate quoted earlier.
    await offer.click();
    await expect(page).toHaveURL(`/applications/${applicationId}`);
    await expect(page.getByText("17-23k", { exact: true })).toBeVisible();
    await expect(page.getByText("21k", { exact: true })).toBeVisible();
  });
});
