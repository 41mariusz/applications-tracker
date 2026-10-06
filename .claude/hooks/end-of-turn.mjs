#!/usr/bin/env node
// Stop: before the agent finishes, sweep everything this turn changed — including files rewritten
// through Bash, which never reach the per-edit hook — in every checkout the session touched.
// One retry: when this hook already sent the agent back (stop_hook_active), let it finish;
// the commit hook (lint-staged) and CI catch the rest.
import { existsSync } from "node:fs";
import path from "node:path";
import {
  LINTED,
  MIGRATION,
  block,
  clearRegistry,
  git,
  readPayload,
  registeredRoots,
  run,
  sessionId,
} from "./lib.mjs";

const payload = readPayload();
// loop_count covers Cursor, which imports hooks from .claude/settings.json.
if (payload.stop_hook_active === true || Number(payload.loop_count ?? 0) > 0) process.exit(0);

const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const sid = sessionId(payload);
const roots = [
  ...new Set(
    [git(["rev-parse", "--show-toplevel"], cwd), ...registeredRoots(sid)].filter((r) => r && existsSync(r)),
  ),
];
if (roots.length === 0) {
  // Not silent: the user sees why nothing was checked.
  process.stdout.write(`${JSON.stringify({ systemMessage: `end-of-turn.mjs: no git checkout at ${cwd}, nothing checked.` })}\n`);
  process.exit(0);
}

const report = [];
for (const root of roots) {
  const listed = [
    ...(git(["diff", "--name-only", "HEAD"], root) ?? "").split("\n"),
    ...(git(["ls-files", "-o", "--exclude-standard"], root) ?? "").split("\n"),
  ].filter(Boolean);
  const changed = [...new Set(listed)].filter((f) => existsSync(path.join(root, f)));
  // Docs-only or no changes (a Q&A turn, context/ notes): nothing the checks below cover.
  const code = changed.filter((f) => !f.endsWith(".md"));
  if (code.length === 0) continue;

  const lintFiles = code.filter((f) => LINTED.test(f) && !f.startsWith(".claude/"));
  if (lintFiles.length > 0) {
    const res = run("npx", ["--no-install", "eslint", "--quiet", ...lintFiles], root);
    if (!res.ok) report.push(`ESLint errors in changed files (${root}):\n${res.output}`);
  }
  // UI contract (literal colours in token views) — cheap, same scan as `npm run lint`.
  const ui = run("node", ["scripts/check-ui-literals.mjs"], root);
  if (!ui.ok) report.push(`UI-literal scan fails (${root}):\n${ui.output}`);
  if (code.some((f) => MIGRATION.test(f))) {
    const res = run("node", ["scripts/check-migrations.mjs"], root);
    if (!res.ok) report.push(`Migration lint fails (${root}):\n${res.output}`);
  }
  // The whole unit suite runs in about a second, so run all of it: it also catches a red test
  // in a module this turn only imported.
  const tests = run("npx", ["--no-install", "vitest", "run"], root);
  if (!tests.ok) report.push(`Unit tests fail (${root}):\n${tests.output}`);
  // Whole-project typecheck incl. .astro files; astro check generates the gitignored .astro/ types itself.
  const types = run("npx", ["--no-install", "astro", "check"], root);
  if (!types.ok) report.push(`Typecheck (astro check) fails (${root}):\n${types.output}`);
}

if (report.length > 0) block(`Fix these before you finish:\n\n${report.join("\n\n")}`);
// Green: the registered checkouts are clean; start the next turn with an empty registry.
clearRegistry(sid);
process.exit(0);
