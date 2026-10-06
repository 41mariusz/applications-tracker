// Deploy gate: refuses a deploy when the cloud database lacks a repo migration, so new code never
// runs on an older schema (test-plan risk #2). Fails closed: when the cloud state cannot be read,
// the deploy is refused too. Dependency-free (the deploy job runs it before `npm ci`).
// Reads SUPABASE_URL and SUPABASE_KEY (publishable key) and calls the applied_migrations() RPC.
// The decision lives in scripts/lib/migrations.mjs (gateVerdict); this script only performs I/O.
// Exit code: 0 (deploy may proceed) or 1 (blocked). The key is never printed.
/* global AbortSignal -- Node 18+ built-in, not in the scripts' ESLint globals */
import { readdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { URL } from "node:url";
import { gateVerdict, migrationVersions } from "./lib/migrations.mjs";

const MIGRATIONS_DIR = "supabase/migrations";
const ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;
const BACKOFF_MS = 2_000;

// GitHub workflow commands: a message must stay on one line, with "%" escaped.
const escapeAnnotation = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

async function readCloudVersions() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    return { error: `missing env: ${[!url && "SUPABASE_URL", !key && "SUPABASE_KEY"].filter(Boolean).join(", ")}` };
  }

  let endpoint;
  try {
    endpoint = new URL("/rest/v1/rpc/applied_migrations", url).href;
  } catch {
    return { error: "SUPABASE_URL is not a valid URL" };
  }

  let lastError = "no attempt made";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(BACKOFF_MS * (attempt - 1));
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const cause = error?.cause?.code ?? error?.cause?.message;
      lastError = `request to ${endpoint} failed after ${attempt} attempt(s): ${error?.name === "TimeoutError" ? `timeout after ${TIMEOUT_MS} ms` : (error?.message ?? error)}${cause ? ` (${cause})` : ""}`;
      continue;
    }

    if (!response.ok) {
      lastError = `HTTP ${response.status} from ${endpoint}${statusHint(response.status)}`;
      // A 4xx will not change on retry; 5xx (and 540 paused) might be transient.
      if (response.status < 500) break;
      continue;
    }

    let body;
    try {
      body = await response.json();
    } catch {
      return { error: `unparsable response body from ${endpoint} (expected a JSON array)` };
    }
    if (!Array.isArray(body) || !body.every((v) => typeof v === "string")) {
      return { error: `unexpected response body from ${endpoint} (expected a JSON array of version strings)` };
    }
    return { cloud: body };
  }
  return { error: lastError };
}

function statusHint(status) {
  if (status === 404) return " — is the applied_migrations migration pushed? run npx supabase db push";
  if (status === 401 || status === 403) return " — check the SUPABASE_KEY secret (publishable key)";
  if (status === 540) return " — the Supabase project is paused; restore it in the dashboard";
  return "";
}

const repo = migrationVersions(readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")));
const verdict = gateVerdict({ repo, ...(await readCloudVersions()) });

const line = `${verdict.title}: ${verdict.message}`;
if (verdict.ok) console.log(line);
else console.error(line);
if (process.env.GITHUB_ACTIONS === "true") {
  console.log(`::${verdict.level} title=${verdict.title}::${escapeAnnotation(verdict.message)}`);
}
process.exit(verdict.ok ? 0 : 1);
