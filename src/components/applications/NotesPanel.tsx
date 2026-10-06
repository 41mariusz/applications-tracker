import React, { useId, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ErrorText from "@/components/ErrorText";
import { apiRequest } from "@/lib/api-client";
import { errorMessage, type ClientMessage } from "@/lib/domain/client-errors";
import { formatDateTime, toLocalInputValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NOTE_KINDS, NOTE_KIND_LABELS, type Note, type NoteKind } from "@/types";

interface Props {
  applicationId: string;
  notes: Note[];
}

// Inline text actions: link variant without the button box.
const textActionClass = "h-auto p-0 font-normal";

type FieldErrors = Partial<Record<"kind" | "body" | "noted_at", string>>;
type Errors = FieldErrors & { form?: ClientMessage };

async function send(url: string, method: string, op: string, body?: FormData): Promise<Errors | null> {
  const result = await apiRequest(url, { method, body, op });
  if (result.kind === "ok") return null;
  // Field errors from validation; anything else is one message for the whole form.
  if (result.kind === "http" && result.data.errors) return result.data.errors;
  return {
    form: errorMessage(result, method === "DELETE" ? "Nie udało się usunąć notatki." : "Nie udało się zapisać."),
  };
}

// The form sends local time converted to ISO, so the server stores the moment the user meant.
function toFormData(kind: NoteKind, body: string, localDateTime: string) {
  const data = new FormData();
  data.set("kind", kind);
  data.set("body", body);
  data.set("noted_at", localDateTime ? new Date(localDateTime).toISOString() : "");
  return data;
}

const noopSubscribe = () => () => undefined;

interface NoteFormProps {
  // noted_at: null means "now", resolved in the browser.
  initial: { kind: NoteKind; body: string; noted_at: string | null };
  submitLabel: string;
  onSubmit: (data: FormData) => Promise<Errors | null>;
  onCancel?: () => void;
}

function NoteForm({ initial, submitLabel, onSubmit, onCancel }: NoteFormProps) {
  const [kind, setKind] = useState<NoteKind>(initial.kind);
  const [body, setBody] = useState(initial.body);
  // Local time is only known in the browser: render the field empty on the server and fill it
  // once hydrated, so SSR and hydration agree. `edited` holds the user's own value.
  const inBrowser = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [openedAt] = useState(() => new Date().toISOString());
  const [edited, setNotedAt] = useState<string | null>(null);
  const notedAt = edited ?? (inBrowser ? toLocalInputValue(initial.noted_at ?? openedAt) : "");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  // Error ids built with useId: submitLabel contains spaces, which would break aria-describedby.
  const errorId = useId();
  const bodyErrorId = `${errorId}-body`;
  const notedErrorId = `${errorId}-noted`;

  async function submit() {
    setPending(true);
    const result = await onSubmit(toFormData(kind, body, notedAt));
    if (result) {
      setErrors(result);
      setPending(false);
    }
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Typ notatki">
        {NOTE_KINDS.map((k) => (
          <Button
            key={k}
            type="button"
            variant="outline"
            size="sm"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
            }}
            className={cn(
              "text-foreground hover:text-foreground h-auto rounded-full px-3 py-1 text-xs font-normal shadow-none",
              kind === k ? "border-link bg-accent hover:bg-accent font-medium" : "border-input bg-card hover:bg-muted",
            )}
          >
            {kind === k && <Check className="size-3.5" aria-hidden="true" />}
            {NOTE_KIND_LABELS[k]}
          </Button>
        ))}
      </div>
      <div>
        <Label className="sr-only" htmlFor={`body-${submitLabel}`}>
          Treść notatki
        </Label>
        <Textarea
          id={`body-${submitLabel}`}
          value={body}
          rows={3}
          placeholder="Co zostało ustalone?"
          onChange={(e) => {
            setBody(e.target.value);
          }}
          className="bg-muted"
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? bodyErrorId : undefined}
        />
        {errors.body && (
          <p id={bodyErrorId} role="alert" className="text-destructive mt-1 text-xs">
            {errors.body}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-supporting-foreground text-xs font-normal" htmlFor={`noted-${submitLabel}`}>
          Kiedy
        </Label>
        <Input
          id={`noted-${submitLabel}`}
          type="datetime-local"
          value={notedAt}
          onChange={(e) => {
            setNotedAt(e.target.value);
          }}
          className="bg-muted w-auto"
          aria-invalid={errors.noted_at ? true : undefined}
          aria-describedby={errors.noted_at ? notedErrorId : undefined}
        />
        {errors.noted_at && (
          <p id={notedErrorId} role="alert" className="text-destructive text-xs">
            {errors.noted_at}
          </p>
        )}
      </div>
      {errors.form && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>
              <ErrorText message={errors.form} />
            </p>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending} className="rounded-lg px-4">
          {pending ? "Zapisywanie…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="link" onClick={onCancel} className={textActionClass}>
            Anuluj
          </Button>
        )}
      </div>
    </form>
  );
}

function NoteItem({ note }: { note: Note }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<ClientMessage | null>(null);
  const [removing, setRemoving] = useState(false);
  const removed = note.deleted_at !== null;

  async function remove() {
    if (!window.confirm("Usunąć notatkę? Zostanie na osi czasu jako przekreślona.")) return;
    setRemoving(true);
    setError(null);
    const result = await send(`/api/notes/${note.id}`, "DELETE", "note.remove");
    if (result) {
      setError(result.form ?? { text: "Nie udało się usunąć notatki." });
      setRemoving(false);
    } else window.location.reload();
  }

  if (editing) {
    return (
      <li className="border-link/40 bg-muted rounded-xl border p-4">
        <NoteForm
          initial={note}
          submitLabel="Zapisz zmiany"
          onCancel={() => {
            setEditing(false);
          }}
          onSubmit={async (data) => {
            const result = await send(`/api/notes/${note.id}`, "PATCH", "note.edit", data);
            if (!result) window.location.reload();
            return result;
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={cn("bg-muted rounded-xl border p-4", removed && "opacity-70")}
      data-note-id={note.id}
      data-removed={removed ? "true" : undefined}
    >
      <div className="text-supporting-foreground mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span>
          <span className="text-foreground font-medium">{NOTE_KIND_LABELS[note.kind]}</span> ·{" "}
          {formatDateTime(note.noted_at)}
          {note.revisions.length > 0 && <span> · edytowano</span>}
          {removed && <span> · usunięto</span>}
        </span>
        {!removed && (
          <span className="flex gap-3">
            <Button
              type="button"
              variant="link"
              disabled={removing}
              onClick={() => {
                setEditing(true);
              }}
              className={cn(textActionClass, "text-xs")}
            >
              Edytuj
            </Button>
            <Button
              type="button"
              variant="link"
              disabled={removing}
              onClick={() => void remove()}
              className={cn(textActionClass, "text-xs")}
            >
              {removing ? "Usuwanie…" : "Usuń"}
            </Button>
          </span>
        )}
      </div>
      <p className={cn("break-words whitespace-pre-wrap", removed && "line-through")}>{note.body}</p>
      {error && (
        <p role="alert" className="text-destructive mt-1 text-xs">
          <ErrorText message={error} />
        </p>
      )}
      {note.revisions.length > 0 && (
        <details className="text-muted-foreground mt-2 text-xs">
          <summary className="focus-visible:ring-ring cursor-pointer rounded-sm outline-none focus-visible:ring-2">
            Poprzednie wersje ({note.revisions.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {note.revisions.map((r) => (
              <li key={r.id} className="border-input border-l pl-3">
                <p>
                  Do {formatDateTime(r.changed_at)} · {NOTE_KIND_LABELS[r.previous_kind]} ·{" "}
                  {formatDateTime(r.previous_noted_at)}
                </p>
                <p className="break-words whitespace-pre-wrap">{r.previous_body}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export default function NotesPanel({ applicationId, notes }: Props) {
  return (
    <section className="space-y-4">
      <Card className="block rounded-xl p-4 shadow-none">
        <h2 className="mb-3 text-sm font-semibold">Dodaj notatkę</h2>
        <NoteForm
          initial={{ kind: "phone_call", body: "", noted_at: null }}
          submitLabel="Dodaj"
          onSubmit={async (data) => {
            const result = await send(`/api/applications/${applicationId}/notes`, "POST", "note.add", data);
            if (!result) window.location.reload();
            return result;
          }}
        />
      </Card>
      {notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Brak notatek. Dopisz ustalenia po rozmowie.</p>
      ) : (
        <ul className="space-y-3" data-testid="notes-timeline">
          {notes.map((note) => (
            <NoteItem key={note.id} note={note} />
          ))}
        </ul>
      )}
    </section>
  );
}
