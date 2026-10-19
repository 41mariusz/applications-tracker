# Team Engineering Conventions

This is the review standard for `team-code-review`. It starts from the course handout (`m5l4-shared-conventions.md`), adapted to the Applications Tracker codebase: Astro 7 SSR, React 19 islands, Supabase, Cloudflare Workers.

Markers:

- **(adapted):** a handout rule changed to match this codebase.
- **(repo rule):** a rule added from the project's own rules (`CLAUDE.md`, `context/foundation/lessons.md`).
- Unmarked rules are the handout's own.

## Naming

- Variables and functions: descriptive camelCase, with no abbreviations except `url`, `id`, `api`, `config`.
- Booleans: prefix with `is`, `has`, `should`, `can`.
- Functions: verb first (`getUserById`, not `user`).
- **(adapted)** Files:
  - modules are kebab-case (`api-client.ts`, `cv-urls.ts`);
  - React and Astro components are PascalCase (`ApplicationForm.tsx`, `ApplicationCard.astro`);
  - a test sits next to its module as `<module>.test.ts`.
- Constants: UPPER_SNAKE_CASE (`MAX_CV_BYTES`, `CV_TYPES`).
- **(repo rule)** Language (`CLAUDE.md` § Domain and data):
  - Code, comments and docs are in English.
  - UI text is in Polish.
  - Dates are displayed in `Europe/Warsaw`.

## Error Handling

- **All async operations** are awaited inside `try`/`catch` or `.catch()`.
- **Messages:** an error message says which operation failed and the relevant inputs, but **(adapted)** never personal data: user id only, with no e-mail, no query string and no form values.
- **Empty catch blocks** are not allowed. At minimum, log or rethrow.
- **HTTP errors** include a status code and an actionable message.
- **Cleanup** belongs in `finally` blocks when resources are opened.
- **(repo rule) Errors leave a signal, not just a message** (`context/foundation/lessons.md`):
  - **Logging:** server code logs through `logError` / `logWarn` / `logInfo` with `op` and `entityId`, never a bare `console.error`.
  - **Services** wrap Supabase errors with `toServiceError`, so the cause is kept.
  - **Routes** answer through `readFormData` / `failureResponse`.
  - **Failed reads** answer 5xx, never 200 with an empty list.
- **(repo rule) Browser** (`CLAUDE.md` § Errors and observability):
  - Browser code calls the API only through `apiRequest`.
  - It never wraps a request or a JSON parse in a bare `catch {}`.

## TypeScript

- **`any`** is not allowed without an explicit justification comment. The repo's ESLint (`strictTypeChecked`) flags it.
- **Object shapes:** prefer `interface` over `type`, which is already the dominant style in `src/`.
- **External data:** type it as `unknown` and narrow it with type guards, or **(repo rule)** parse it with zod at system boundaries (`CLAUDE.md` § Key conventions, API routes).
- **States:** model them with discriminated unions, not optional fields.
- **Generic parameters:** use descriptive names (`TUser`, not `T`).
- **(repo rule) Shared types** (`CLAUDE.md` § Key conventions): entities and DTOs live in `src/types.ts`.

## Functions

- **Single responsibility:** if you need "and" to describe it, split it.
- **Parameters:** at most 3; beyond that, use an options object.
- **Control flow:** prefer early returns over nested conditionals.
- **Queries** (`get*`, `find*`, `is*`) must be pure.
- **(repo rule) Where code goes** (`CLAUDE.md` § Key conventions):
  - business rules are pure functions in `src/lib/domain/`, each with a `.test.ts`;
  - Supabase reads and writes go in `src/lib/services/`;
  - other helpers go in `src/lib/`;
  - rules are not put in components or routes.
- **(repo rule) Writes with a trace** (`CLAUDE.md` § Hard rules): a write that must leave a trace (status change, field change, note revision) goes through one SQL function, together with its history row.

## Security

- **Secrets:** none in code; use environment variables only.
- **(adapted) Supabase key:** the app reads only `SUPABASE_URL` and the publishable `SUPABASE_KEY`. The service-role key is never read by app code.
- **User input** is validated at system boundaries **(adapted)** with zod in API routes. The body is parsed inside `try`, so a malformed body is a 400, not a 500.
- **SQL:** parameterised statements only. Writes that must be atomic go through SQL functions.
- **API responses** never leak stack traces or internal paths.
- **(repo rule) Authorisation** (`CLAUDE.md` § Hard rules, Supabase migrations):
  - An API route checks `context.locals.user` and returns 401 itself.
  - New tables get RLS with per-operation, per-role policies.
  - Nothing is deleted: there are no delete policies, and "removing" is a status or `deleted_at`.
- **(repo rule) Redirects** (`CLAUDE.md` § Auth flow): only through `safeNextPath()`, so there is no open redirect.

## Testing

- **Test names** describe behaviour: "returns empty array when no results found".
- **Each test** owns its setup and teardown.
- **Assertions are specific:** `toEqual(expected)`, not `toBeTruthy()`.
- **Edge cases are covered:** empty, null, boundary values and error paths.
- **(repo rule) Proportional to risk** (`CLAUDE.md` § Commands, `context/foundation/test-plan.md`):
  - every rule in `src/lib/domain/` has unit tests;
  - atomic writes have pgTAP tests;
  - each user-facing feature extends `scripts/smoke.mjs`;
  - phone-critical views keep their Playwright specs green.
- **(repo rule) Migrations are additive and backward-compatible** (`context/foundation/lessons.md`, `CLAUDE.md` § Hard rules):
  - **What breaks:** drops, renames, type changes, or a new NOT NULL column without a default break the previous code version that runs on the new schema.
  - **Lint:** `npm run lint` flags them.
  - **Release order:** the owner runs `npx supabase db push` before pushing code that needs a migration.

## UI (repo rule, `CLAUDE.md` § UI contract)

- **Design tokens:**
  - Colours, surfaces and focus come from the tokens in `src/styles/global.css` (`bg-card`, `text-muted-foreground`, `ring-ring`, …).
  - No literal colours or arbitrary values in views (`text-purple-300`, `#hex`, `p-[13px]`).
- **Components:**
  - Check `src/components/ui/` before writing a component.
  - Merge classes with `cn()`.
- **Phone rules (360 px):**
  - controls are at least 40 px tall;
  - card text wraps at any character;
  - side-by-side rows stack below 640 px;
  - keyboard focus uses the `ring` token.
