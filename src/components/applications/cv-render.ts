// Browser-only CV rendering. Loaded on demand (dynamic import) when the user opens a preview,
// so pdf.js and docx-preview never weigh down the regular pages.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { renderAsync } from "docx-preview";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// PDF: every page to a canvas, scaled to the container width (sharp on high-DPI phones).
export async function renderPdf(bytes: ArrayBuffer, container: HTMLElement): Promise<void> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const width = container.clientWidth || 600;
  const ratio = window.devicePixelRatio || 1;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * ratio });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = "100%";
    canvas.style.display = "block";
    canvas.style.marginBottom = "8px";
    canvas.setAttribute("aria-label", `Strona ${n} z ${doc.numPages}`);
    container.appendChild(canvas);
    await page.render({ canvas, viewport }).promise;
  }
}

// DOCX: rendered to HTML in the page — the file never leaves the app for an external viewer.
export async function renderDocx(bytes: ArrayBuffer, container: HTMLElement): Promise<void> {
  await renderAsync(bytes, container, undefined, {
    inWrapper: false,
    ignoreWidth: true,
    ignoreHeight: true,
    breakPages: true,
  });
}
