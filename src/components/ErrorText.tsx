import type { ClientMessage } from "@/lib/domain/client-errors";

// A client error message (src/lib/domain/client-errors.ts errorMessage), with its link when it has one
// (e.g. the paused project → /paused). The colour comes from the surrounding Alert or text-destructive.
export default function ErrorText({ message }: { message: ClientMessage }) {
  return (
    <>
      {message.text}
      {message.href && (
        <>
          {" "}
          <a
            href={message.href}
            className="focus-visible:ring-ring rounded-sm font-medium underline outline-none focus-visible:ring-2"
          >
            {message.linkLabel ?? "Szczegóły"}
          </a>
        </>
      )}
    </>
  );
}
