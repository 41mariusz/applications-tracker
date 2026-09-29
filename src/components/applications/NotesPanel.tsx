import React, { useState, useSyncExternalStore } from "react";
import { formatDateTime, toLocalInputValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NOTE_KINDS, NOTE_KIND_LABELS, type Note, type NoteKind } from "@/types";

interface Props {
  applicationId: string;
  notes: Note[];
}

const inputClass =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:ring-2 focus:ring-purple-400 focus:outline-none";

type Errors = Partial<Record<"kind" | "body" | "noted_at" | "form", string>>;

async function send(url: string, method: string, body?: FormData): Promise<Errors | null> {
  try {
    const response = await fetch(url, { method, body });
    if (response.ok) return null;
    const data = (await response.json()) as { errors?: Errors; error?: string };
    return data.errors ?? { form: data.error ?? "Nie udało się zapisać." };
  } catch {
    return { form: "Brak połączenia. Spróbuj ponownie." };
  }
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
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              kind === k ? "border-purple-300 bg-purple-500/40" : "border-white/20 bg-white/5 hover:bg-white/10",
            )}
          >
            {NOTE_KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <div>
        <label className="sr-only" htmlFor={`body-${submitLabel}`}>
          Treść notatki
        </label>
        <textarea
          id={`body-${submitLabel}`}
          value={body}
          rows={3}
          placeholder="Co zostało ustalone?"
          onChange={(e) => {
            setBody(e.target.value);
          }}
          className={inputClass}
        />
        {errors.body && <p className="mt-1 text-xs text-red-300">{errors.body}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-blue-100/70" htmlFor={`noted-${submitLabel}`}>
          Kiedy
        </label>
        <input
          id={`noted-${submitLabel}`}
          type="datetime-local"
          value={notedAt}
          onChange={(e) => {
            setNotedAt(e.target.value);
          }}
          className={cn(inputClass, "w-auto py-1 text-sm")}
        />
        {errors.noted_at && <p className="text-xs text-red-300">{errors.noted_at}</p>}
      </div>
      {errors.form && <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">{errors.form}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-purple-500 disabled:opacity-60"
        >
          {pending ? "Zapisywanie…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-purple-300 hover:underline">
            Anuluj
          </button>
        )}
      </div>
    </form>
  );
}

function NoteItem({ note }: { note: Note }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removed = note.deleted_at !== null;

  async function remove() {
    if (!window.confirm("Usunąć notatkę? Zostanie na osi czasu jako przekreślona.")) return;
    const result = await send(`/api/notes/${note.id}`, "DELETE");
    if (result) setError(result.form ?? "Nie udało się usunąć notatki.");
    else window.location.reload();
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-purple-300/40 bg-white/10 p-4">
        <NoteForm
          initial={note}
          submitLabel="Zapisz zmiany"
          onCancel={() => {
            setEditing(false);
          }}
          onSubmit={async (data) => {
            const result = await send(`/api/notes/${note.id}`, "PATCH", data);
            if (!result) window.location.reload();
            return result;
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={cn("rounded-xl border border-white/10 bg-white/10 p-4", removed && "opacity-50")}
      data-note-id={note.id}
      data-removed={removed ? "true" : undefined}
    >
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-blue-100/70">
        <span>
          <span className="font-medium text-blue-100">{NOTE_KIND_LABELS[note.kind]}</span> ·{" "}
          {formatDateTime(note.noted_at)}
          {note.revisions.length > 0 && <span> · edytowano</span>}
          {removed && <span> · usunięto</span>}
        </span>
        {!removed && (
          <span className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setEditing(true);
              }}
              className="text-purple-300 hover:underline"
            >
              Edytuj
            </button>
            <button type="button" onClick={() => void remove()} className="text-purple-300 hover:underline">
              Usuń
            </button>
          </span>
        )}
      </div>
      <p className={cn("whitespace-pre-wrap", removed && "line-through")}>{note.body}</p>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      {note.revisions.length > 0 && (
        <details className="mt-2 text-xs text-blue-100/60">
          <summary className="cursor-pointer">Poprzednie wersje ({note.revisions.length})</summary>
          <ul className="mt-2 space-y-2">
            {note.revisions.map((r) => (
              <li key={r.id} className="border-l border-white/20 pl-3">
                <p>
                  Do {formatDateTime(r.changed_at)} · {NOTE_KIND_LABELS[r.previous_kind]} ·{" "}
                  {formatDateTime(r.previous_noted_at)}
                </p>
                <p className="whitespace-pre-wrap">{r.previous_body}</p>
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
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Dodaj notatkę</h2>
        <NoteForm
          initial={{ kind: "phone_call", body: "", noted_at: null }}
          submitLabel="Dodaj"
          onSubmit={async (data) => {
            const result = await send(`/api/applications/${applicationId}/notes`, "POST", data);
            if (!result) window.location.reload();
            return result;
          }}
        />
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-blue-100/60">Brak notatek. Dopisz ustalenia po rozmowie.</p>
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
