// Migration lint: a new migration must not break the code version production already runs, because
// that code runs on the new schema after every `npx supabase db push` and after a `wrangler rollback`.
// Dependency-free; runs as part of `npm run lint`. The rules live in scripts/lib/migrations.mjs.
// An intentional break needs a reasoned override on the statement's line or the line above:
//   -- migration-lint: allow <rule> — <reason>
import { readdirSync, readFileSync } from "node:fs";
import { lintMigrationSql, migrationVersion } from "./lib/migrations.mjs";

const MIGRATIONS_DIR = "supabase/migrations";

// The last migration before this rule existed. Applied history is exempt: it is already in the cloud,
// is never edited, and contains statements the rules would flag (`revoke all on table public.keepalive`).
const BASELINE_VERSION = "20261004120000";

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .filter((name) => migrationVersion(name) > BASELINE_VERSION)
  .sort();

const hits = [];
for (const name of files) {
  const file = `${MIGRATIONS_DIR}/${name}`;
  for (const { line, rule, text } of lintMigrationSql(readFileSync(file, "utf8"))) {
    hits.push(`${file}:${line} ${rule}: ${text}`);
  }
}

if (hits.length > 0) {
  console.error("Migration statements that would break the previous code version:");
  for (const hit of hits) console.error(`  ${hit}`);
  console.error("Keep migrations additive. For an intentional break add: -- migration-lint: allow <rule> — <reason>");
  process.exit(1);
}
console.log(`Migration lint: ${files.length} new migration(s) after ${BASELINE_VERSION} checked, all additive.`);
