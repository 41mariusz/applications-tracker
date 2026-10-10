// S-06 (roadmap M-2): the application list on a 360 px phone. During a call the owner reads it on the
// phone: nothing may scroll sideways (even an unbroken company name), the status control sits in one
// place (under the title), chips and status are thumb-sized, and a closed application is struck through
// while its status control stays at full contrast (plan: context/changes/phone-friendly-list, Phase 2).
import { test, expect } from "@playwright/test";
import { deleteApplication } from "./support/local-admin";

test.use({ viewport: { width: 360, height: 740 } });

test.describe("S-06: application list on a 360 px phone", () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }, testInfo) => {
    // Remove whatever was created, each delete independently: one failure must not strand the others.
    const ids = createdIds.splice(0);
    const results = await Promise.allSettled(ids.map((id) => deleteApplication(request, id)));
    const failed = results.flatMap((r, i) => (r.status === "rejected" ? [`${ids[i]}: ${String(r.reason)}`] : []));
    expect(failed, "every application created by the test must be deleted").toEqual([]);
    if (testInfo.status === testInfo.expectedStatus) {
      expect(ids, "both applications created by the test must be cleaned up").toHaveLength(2);
    }
  });

  test("no sideways scroll, status under the title, 40 px targets, closed card struck through at full-contrast status", async ({
    page,
    baseURL,
  }) => {
    const tag = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
    // No spaces or hyphens: without wrap-anywhere this name alone is wider than the phone.
    const unbroken = `[E2E]Przedsiebiorstwoinformatyczneuslugowebardzodluganazwa${tag}`;
    const closed = `[E2E] Closed ${tag}`;
    const origin = new URL(baseURL ?? "").origin;
    const create = async (company: string) => {
      const res = await page.request.post("/api/applications", {
        headers: { Origin: origin },
        form: { company, position: "Frontend Developer", salary_range: "15-18k" },
      });
      expect(res.status()).toBe(201);
      const id = ((await res.json()) as { id: string }).id;
      createdIds.push(id);
      return id;
    };
    await create(unbroken);
    const closedId = await create(closed);
    const res = await page.request.post(`/api/applications/${closedId}/status`, {
      headers: { Origin: origin },
      form: { status: "rejected" },
    });
    await expect(res).toBeOK();

    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: unbroken })).toBeVisible();
    // Status controls are islands hydrated on visibility: wait for every visible card's control.
    const cards = page.getByTestId("application-visible");
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await cards.nth(i).scrollIntoViewIfNeeded();
      await expect(cards.nth(i).getByLabel("Zmień status")).toBeVisible();
    }

    // No horizontal overflow.
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll, "the page must not scroll sideways at 360 px").toBeLessThanOrEqual(width.client);

    // Every visible card: the status control starts below the title block; it is at least 40 px tall.
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const title = await card.getByTestId("card-title").boundingBox();
      const status = await card.getByLabel("Zmień status").boundingBox();
      expect(title && status, "card title and status control are rendered").toBeTruthy();
      if (!title || !status) continue;
      expect(status.y, `card ${i}: status control under the title`).toBeGreaterThanOrEqual(title.y + title.height);
      expect(status.height, `card ${i}: status control at least 40 px`).toBeGreaterThanOrEqual(40);
    }

    // Every filter chip is at least 40 px tall.
    const chips = page.getByTestId("status-filter").locator("label");
    const chipCount = await chips.count();
    expect(chipCount).toBeGreaterThan(0);
    for (let i = 0; i < chipCount; i++) {
      const box = await chips.nth(i).boundingBox();
      expect(box?.height ?? 0, `chip ${i} at least 40 px`).toBeGreaterThanOrEqual(40);
    }

    // Closed card: struck-through title; its status control has no reduced-opacity ancestor.
    const closedCard = cards.filter({ has: page.getByRole("link", { name: closed }) });
    await expect(closedCard.getByTestId("card-title")).toHaveCSS("text-decoration-line", "line-through");
    const dimmed = await closedCard.getByLabel("Zmień status").evaluate((el) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        if (Number(getComputedStyle(n).opacity) < 1) return true;
      }
      return false;
    });
    expect(dimmed, "the closed card's status control must not be dimmed").toBe(false);
  });
});
