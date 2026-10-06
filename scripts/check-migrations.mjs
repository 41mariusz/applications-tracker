// Migration lint: a new migration must not break the code version production already runs, because
// that code runs on the new schema after every `npx supabase db push` and after a `wrangler rollback`.
// Dependency-free; runs as part of `npm run lint`. The rules live in scripts/lib/migrations.mjs.
// An intentional break needs a reasoned override alone on the line above the statement, or after
// the code on the line where the statement ends:
//   -- migration-lint: allow <rule> — <reason>
import { readdirSync, readFileSync } from "node:fs";
import { lintMigration, migrationVersion } from "./lib/migrations.mjs";

const MIGRATIONS_DIR = "supabase/migrations";

// The migrations applied before this lint existed, exempt by name: they are already in the cloud,
// are never edited, and contain statements the rules would flag (`revoke all on table public.keepalive`).
// Every other .sql file is linted, so a new migration back-dated below these is not exempt.
const APPLIED_BEFORE_LINT = new Set([
  "20260929180000_create_applications.sql",
  "20260929190000_create_status_changes.sql",
  "20260930090000_create_notes.sql",
  "20260930120000_create_field_changes.sql",
  "20260930150000_atomic_writes.sql",
  "20261001090000_cv_files.sql",
  "20261004120000_keepalive.sql",
]);

const all = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();
for (const name of all) {
  try {
    migrationVersion(name);
  } catch {
    console.error(`Malformed migration file name: ${MIGRATIONS_DIR}/${name} (expected YYYYMMDDHHmmss_name.sql)`);
    process.exit(1);
  }
}
const files = all.filter((name) => !APPLIED_BEFORE_LINT.has(name));
const exempt = all.length - files.length;

const hits = [];
let overridden = 0;
for (const name of files) {
  const file = `${MIGRATIONS_DIR}/${name}`;
  const { findings, suppressed } = lintMigration(readFileSync(file, "utf8"));
  overridden += suppressed;
  for (const { line, rule, text } of findings) hits.push(`${file}:${line} ${rule}: ${text}`);
}

if (hits.length > 0) {
  console.error("Migration statements that would break the previous code version:");
  for (const hit of hits) console.error(`  ${hit}`);
  console.error("Keep migrations additive. For an intentional break add: -- migration-lint: allow <rule> — <reason>");
  process.exit(1);
}
const overrides = overridden > 0 ? `, ${overridden} override(s) applied` : "";
console.log(
  `Migration lint: ${files.length} migration(s) checked (${exempt} applied before the lint are exempt), no breaking statements${overrides}.`,
);
