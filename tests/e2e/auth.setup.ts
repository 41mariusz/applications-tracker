import { test as setup, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";
// @supabase/ssr names the cookie after the first label of the Supabase host: 127.0.0.1 → "127".
const LOCAL_SUPABASE_REFS = ["127", "localhost"];

setup("sign in once and save the session", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD (see context/foundation/test-stack.md, ## E2E)");
  }

  await page.goto("/auth/signin");
  // The sign-in form is a React island: input typed before it hydrates is lost and validation
  // then blocks the submit. Retry fill + submit until the submit leaves the sign-in page.
  // Clear before filling: re-filling the same value fires no change event in a controlled input.
  await expect(async () => {
    await page.getByLabel("E-mail").fill("");
    await page.getByLabel("E-mail").fill(username);
    await page.getByLabel("Hasło", { exact: true }).fill("");
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/signin"), { timeout: 5_000 });
  }).toPass();
  await expect(page.getByRole("heading", { name: "Moje aplikacje" })).toBeVisible();

  // The session cookie names the Supabase project the running app uses (sb-<ref>-auth-token, maybe
  // chunked). Check it before saving the session, so a server built against or reused with another
  // backend never gets a single spec to run.
  const refs = (await page.context().cookies())
    .map((c) => /^sb-(.+)-auth-token(\.\d+)?$/.exec(c.name)?.[1])
    .filter((ref): ref is string => ref !== undefined);
  const foreign = refs.filter((ref) => !LOCAL_SUPABASE_REFS.includes(ref));
  if (refs.length === 0 || foreign.length > 0) {
    throw new Error(
      `E2E stopped: the app under test is not using the local Supabase (session cookie project: ${refs.join(", ") || "none"}). Check .dev.vars.e2e and stop any server already running on the E2E port.`,
    );
  }

  await page.context().storageState({ path: authFile });
});
