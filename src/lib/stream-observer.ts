// Pass-through wrapper for a streamed response body: bytes go through untouched (no buffering) and
// `onError` is called once when reading the source fails — an error after the first byte, which
// Astro can no longer turn into a 500 page.
export function observeStream<T>(body: ReadableStream<T>, onError: (error: unknown) => void): ReadableStream<T> {
  const reader = body.getReader();
  let reported = false;

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        if (!reported) {
          reported = true;
          onError(error);
        }
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
