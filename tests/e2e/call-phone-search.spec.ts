// risk: #1 (test-plan.md) — during an HR call, searching by a phone number typed in another
// format than stored must show the right application live, with the call info on its page.
// Modelled on seed.spec.ts. Real boundaries: auth, routing, SSR list, live filter script, DB.
import { test, expect } from "@playwright/test";
import { deleteApplication } from "./support/local-admin";

test.describe("risk #1: phone search during a call", () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }) => {
    // Remove whatever was created first, then require both offers (the match and the decoy).
    const ids = createdIds.splice(0);
    for (const id of ids) await deleteApplication(request, id);
    expect(ids, "both applications created by the test must be cleaned up").toHaveLength(2);
  });

  test("a number typed with +48 and spaces finds the offer stored with dashes and shows the call info", async ({
    page,
    baseURL,
  }) => {
    // Setup: the offer whose HR phone is stored as 5xx-xxx-xxx (unique per run), and a decoy with
    // another number, so the list has something the live filter must hide.
    const digits = String(500_000_000 + Math.floor(Math.random() * 400_000_000));
    const decoyDigits = String(Number(digits) + 1);
    const stored = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    const typed = `+48 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    const company = `[E2E] Call ${digits}`;
    const decoy = `[E2E] Decoy ${decoyDigits}`;
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

    // The recruiter calls: the owner types the number as it shows on the phone.
    await page.getByRole("searchbox", { name: "Szukaj" }).fill(typed);

    // Live filter: exactly this offer is left on the list, without a page load.
    await expect(page.getByRole("link", { name: decoy })).toBeHidden();
    await expect(page.getByTestId("search-count")).toHaveText("1");
    const offer = page.getByRole("link", { name: company });
    await expect(offer).toBeVisible();

    // Opening it shows what the call needs: the salary range and the rate quoted earlier.
    await offer.click();
    await expect(page).toHaveURL(`/applications/${applicationId}`);
    await expect(page.getByText("17-23k", { exact: true })).toBeVisible();
    await expect(page.getByText("21k", { exact: true })).toBeVisible();
  });
});
