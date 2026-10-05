import { expect, type APIRequestContext } from "@playwright/test";

// The app never deletes anything (PRD), so E2E data is removed by the test process itself, with the
// LOCAL stack's service-role key from the gitignored .env.e2e. Never pointed at a non-local backend.
function localAdmin(): { url: string; key: string } {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY (local Supabase)");
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Refusing to clean up E2E data on ${host}`);
  return { url, key };
}

// Deletes one application (its history and notes cascade) and asserts exactly that row went away.
export async function deleteApplication(request: APIRequestContext, id: string): Promise<void> {
  const { url, key } = localAdmin();
  const res = await request.delete(`${url}/rest/v1/applications?id=eq.${id}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=representation" },
  });
  await expect(res).toBeOK();
  expect(await res.json()).toHaveLength(1);
}
