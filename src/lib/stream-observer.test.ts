import { describe, expect, it, vi } from "vitest";
import { observeStream } from "@/lib/stream-observer";

const encoder = new TextEncoder();

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("observeStream", () => {
  it("passes the bytes through untouched", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("<html>"));
        controller.enqueue(encoder.encode("</html>"));
        controller.close();
      },
    });
    const onError = vi.fn();

    expect(await readAll(observeStream(source, onError))).toBe("<html></html>");
    expect(onError).not.toHaveBeenCalled();
  });

  it("calls onError once and propagates the error when the source fails mid-stream", async () => {
    const failure = new Error("render failed after first byte");
    let sent = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(encoder.encode("<html>"));
        } else {
          controller.error(failure);
        }
      },
    });
    const onError = vi.fn();
    const reader = observeStream(source, onError).getReader();

    expect((await reader.read()).value).toEqual(encoder.encode("<html>"));
    await expect(reader.read()).rejects.toBe(failure);
    await expect(reader.read()).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
