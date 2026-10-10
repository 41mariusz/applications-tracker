// S-08 (roadmap M-2): the CV library on a 360 px phone. Nothing may scroll sideways (even an unbroken
// file name), "Podgląd"/"Pobierz" sit under the file name, every control is thumb-sized, and a closed
// application in the usage list is struck through without being dimmed
// (plan: context/changes/phone-friendly-cv-library, Phase 2).
//
// The CV fixture is NOT cleaned up, on purpose: CV files are never removed (PRD), and the library
// deduplicates by content (unique user_id + sha256), so these constant bytes are stored at most once
// for the E2E user however often the spec runs — a repeat upload answers 200 `reused` with the same row.
// The two applications are the test's own and are deleted in afterEach.
import { test, expect } from "@playwright/test";
import { deleteApplication } from "./support/local-admin";

test.use({ viewport: { width: 360, height: 740 } });

const CV_NAME = "CV_E2E_Bardzodluganazwaplikubezzadnychspacjiwcalejdlugosci.pdf";
const CV_BYTES = "%PDF-1.4 e2e phone CV fixture";

test.describe("S-08: CV library on a 360 px phone", () => {
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

  test("no sideways scroll, actions under the name, 40 px targets, closed usage struck through without opacity", async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? "").origin;

    // The fixed fixture: 201 when new, 200 `reused` when an earlier run already stored it.
    const upload = await page.request.post("/api/cv", {
      headers: { Origin: origin },
      multipart: { file: { name: CV_NAME, mimeType: "application/pdf", buffer: Buffer.from(CV_BYTES) } },
    });
    expect([200, 201], `upload answered ${String(upload.status())}`).toContain(upload.status());
    const cvId = ((await upload.json()) as { file: { id: string } }).file.id;

    const tag = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
    // No spaces or hyphens: without wrap-anywhere this name alone is wider than the phone.
    const unbroken = `[E2E]Przedsiebiorstwoinformatyczneuslugowebardzodluganazwa${tag}`;
    const open = `[E2E] Open CV ${tag}`;
    const create = async (company: string) => {
      const res = await page.request.post("/api/applications", {
        headers: { Origin: origin },
        form: { company, position: "Frontend Developer" },
      });
      expect(res.status()).toBe(201);
      const id = ((await res.json()) as { id: string }).id;
      createdIds.push(id);
      return id;
    };
    const closedId = await create(unbroken);
    const openId = await create(open);
    const rejected = await page.request.post(`/api/applications/${closedId}/status`, {
      headers: { Origin: origin },
      form: { status: "rejected" },
    });
    await expect(rejected).toBeOK();
    for (const id of [closedId, openId]) {
      const attach = await page.request.post(`/api/applications/${id}/cv`, {
        headers: { Origin: origin },
        form: { cv_file_id: cvId },
      });
      await expect(attach).toBeOK();
    }

    await page.goto("/cv");
    // Only this test's own card is measured: other specs share the E2E user.
    const card = page.locator(`[data-cv-id="${cvId}"]`);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();

    const noSidewaysScroll = async (when: string) => {
      const width = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(width.scroll, `the page must not scroll sideways at 360 px (${when})`).toBeLessThanOrEqual(width.client);
    };
    await noSidewaysScroll("collapsed");

    // The actions start below the file name; they and the other controls are at least 40 px tall.
    const name = await card.getByTestId("cv-file-name").boundingBox();
    const preview = card.getByRole("button", { name: "Podgląd" });
    const download = card.getByRole("link", { name: "Pobierz" });
    const usage = card.getByTestId("cv-usage");
    const previewBox = await preview.boundingBox();
    const downloadBox = await download.boundingBox();
    if (!name || !previewBox || !downloadBox) throw new Error("file name and actions must be rendered");
    expect(previewBox.y, "Podgląd under the file name").toBeGreaterThanOrEqual(name.y + name.height);
    expect(downloadBox.y, "Pobierz under the file name").toBeGreaterThanOrEqual(name.y + name.height);
    const tall = [
      ["Podgląd", previewBox],
      ["Pobierz", downloadBox],
      ["usage toggle", await usage.boundingBox()],
      ["file input", await page.locator("#cv-library-upload").boundingBox()],
    ] as const;
    for (const [label, box] of tall) {
      expect(box?.height ?? 0, `${label} at least 40 px`).toBeGreaterThanOrEqual(40);
    }

    // Expanded usage list: both own application links are thumb-sized; the rejected one is struck through.
    await usage.click();
    await expect(usage).toHaveAttribute("aria-expanded", "true");
    const closedLink = card.locator(`a[href="/applications/${closedId}"]`);
    const openLink = card.locator(`a[href="/applications/${openId}"]`);
    for (const link of [closedLink, openLink]) {
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box?.height ?? 0, "application link at least 40 px").toBeGreaterThanOrEqual(40);
    }
    await expect(closedLink).toHaveCSS("text-decoration-line", "line-through");
    const dimmed = await closedLink.evaluate((el) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        if (Number(getComputedStyle(n).opacity) < 1) return true;
      }
      return false;
    });
    expect(dimmed, "the closed application must not be dimmed with opacity").toBe(false);
    await noSidewaysScroll("expanded");
  });
});
