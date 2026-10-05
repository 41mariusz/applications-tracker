import { describe, expect, it } from "vitest";
import {
  checkCvFile,
  cvStoragePath,
  formatFileSize,
  groupByCv,
  isUploadRequestTooLarge,
  MAX_CV_BYTES,
  MAX_CV_REQUEST_BYTES,
  sha256Hex,
} from "@/lib/domain/cv";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("checkCvFile", () => {
  it("accepts PDF and DOCX by type", () => {
    expect(checkCvFile({ name: "cv.pdf", type: "application/pdf", size: 1000 })).toEqual({
      ok: true,
      mimeType: "application/pdf",
      extension: "pdf",
    });
    expect(checkCvFile({ name: "CV.DOCX", type: DOCX, size: 1000 })).toMatchObject({ ok: true, extension: "docx" });
  });

  it("falls back to the extension when the browser sends no useful type", () => {
    expect(checkCvFile({ name: "Moje CV.docx", type: "", size: 1000 })).toMatchObject({ ok: true, mimeType: DOCX });
    expect(checkCvFile({ name: "cv.pdf", type: "application/octet-stream", size: 1000 })).toMatchObject({
      ok: true,
      mimeType: "application/pdf",
    });
  });

  it("rejects other formats, empty and oversized files", () => {
    expect(checkCvFile({ name: "cv.doc", type: "application/msword", size: 1000 }).ok).toBe(false);
    expect(checkCvFile({ name: "photo.png", type: "image/png", size: 1000 }).ok).toBe(false);
    expect(checkCvFile({ name: "cv.pdf", type: "application/pdf", size: 0 }).ok).toBe(false);
    expect(checkCvFile({ name: "cv.pdf", type: "application/pdf", size: MAX_CV_BYTES + 1 }).ok).toBe(false);
    expect(checkCvFile({ name: "cv.pdf", type: "application/pdf", size: MAX_CV_BYTES }).ok).toBe(true);
  });
});

describe("isUploadRequestTooLarge", () => {
  it("allows a request up to the limit and refuses one byte more", () => {
    expect(MAX_CV_REQUEST_BYTES).toBe(MAX_CV_BYTES + 64 * 1024);
    expect(isUploadRequestTooLarge(String(MAX_CV_REQUEST_BYTES))).toBe(false);
    expect(isUploadRequestTooLarge(String(MAX_CV_REQUEST_BYTES + 1))).toBe(true);
  });

  it("lets a missing or malformed Content-Length through to the file check", () => {
    expect(isUploadRequestTooLarge(null)).toBe(false);
    expect(isUploadRequestTooLarge("")).toBe(false);
    expect(isUploadRequestTooLarge("abc")).toBe(false);
  });
});

describe("sha256Hex", () => {
  const bytes = (text: string) => new TextEncoder().encode(text).buffer;

  it("gives the same hash for the same content and a different one otherwise", async () => {
    const a = await sha256Hex(bytes("CV v1"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(bytes("CV v1"))).toBe(a);
    expect(await sha256Hex(bytes("CV v2"))).not.toBe(a);
  });

  it("matches the known SHA-256 of an empty input", async () => {
    expect(await sha256Hex(new ArrayBuffer(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("cvStoragePath", () => {
  it("puts the file in the user's folder, named by its hash", () => {
    expect(cvStoragePath("user-1", "abc", "pdf")).toBe("user-1/abc.pdf");
  });
});

describe("formatFileSize", () => {
  it("uses B, KB and MB", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(200 * 1024)).toBe("200 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});

describe("groupByCv", () => {
  it("lists the applications of each CV, keeps their order, and includes unused CVs", () => {
    const groups = groupByCv(
      [{ id: "cv-a" }, { id: "cv-b" }, { id: "cv-unused" }],
      [
        { id: "1", cv_file_id: "cv-a" },
        { id: "2", cv_file_id: null },
        { id: "3", cv_file_id: "cv-b" },
        { id: "4", cv_file_id: "cv-a" },
      ],
    );
    expect(groups.get("cv-a")?.map((a) => a.id)).toEqual(["1", "4"]);
    expect(groups.get("cv-b")?.map((a) => a.id)).toEqual(["3"]);
    expect(groups.get("cv-unused")).toEqual([]);
  });
});
