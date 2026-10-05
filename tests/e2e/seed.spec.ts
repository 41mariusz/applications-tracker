// Seed for /10x-e2e — the pattern every generated test copies.
// Protects test-plan risk #6: a change to sign-in or routing locks the owner out.
import { test, expect } from "@playwright/test";

// The risk is the signed-out path, so this test opts out of the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test("signing in from a protected link lands on that page and survives a reload", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) throw new Error("Set E2E_USERNAME and E2E_PASSWORD");

  await page.goto("/cv");
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();

  // Same hydration guard as auth.setup.ts: signing in twice changes nothing, so the retry is safe.
  await expect(async () => {
    await page.getByLabel("E-mail").fill("");
    await page.getByLabel("E-mail").fill(username);
    await page.getByLabel("Hasło", { exact: true }).fill("");
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/signin"), { timeout: 5_000 });
  }).toPass();

  // The page the owner asked for, not just a redirect header.
  await expect(page).toHaveURL(/\/cv$/);
  await expect(page.getByRole("heading", { name: "Biblioteka CV" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Biblioteka CV" })).toBeVisible();

  // No cleanup: the test creates no data. It does not sign out — sign-out could revoke the shared session.
});
