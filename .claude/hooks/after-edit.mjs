#!/usr/bin/env node
// PostToolUse (Write|Edit): check only the file the agent just edited, in its own checkout.
// - ESLint on the file (no --fix: rewriting it would make the agent's next Edit fail).
// - Vitest tests related to the file.
// - The migration lint when the file is a migration.
// Whole-project checks (typecheck, every changed file) run at end of turn (end-of-turn.mjs).
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  LINTED,
  MIGRATION,
  TESTED,
  block,
  commonDir,
  git,
  readPayload,
  registerRoot,
  run,
  sessionId,
} from "./lib.mjs";

const payload = readPayload();
const input = payload.tool_input ?? {};
const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
let file = input.file_path ?? input.notebook_path;
if (typeof file !== "string" || !file) process.exit(0);
if (!path.isAbsolute(file)) file = path.resolve(cwd, file);
if (!existsSync(file) || !statSync(file).isFile()) process.exit(0);

// Checkout of the edited file, not $CLAUDE_PROJECT_DIR (stale after EnterWorktree). Files of
// other repositories (~/.claude, other projects) are skipped; any worktree of this repo is checked.
const root = git(["rev-parse", "--show-toplevel"], path.dirname(file));
if (!root) process.exit(0);
const repo = commonDir(root);
if (!repo || repo !== commonDir(cwd)) process.exit(0);
const rel = path.relative(root, file).split(path.sep).join("/");

const lint = LINTED.test(rel) && !rel.startsWith(".claude/");
const tests = TESTED.test(rel) && !rel.startsWith(".claude/");
const migration = MIGRATION.test(rel);
if (!lint && !migration) process.exit(0);

registerRoot(sessionId(payload), root);

const failures = [];
if (lint) {
  // --no-install: a linter that is not installed fails visibly instead of passing.
  const res = run("npx", ["--no-install", "eslint", "--quiet", rel], root);
  if (!res.ok) failures.push(`ESLint reported errors in ${rel}:\n${res.output}`);
}
if (tests) {
  const res = run("npx", ["--no-install", "vitest", "related", rel, "--run"], root);
  if (!res.ok) failures.push(`Tests related to ${rel} fail:\n${res.output}`);
}
if (migration) {
  const res = run("node", ["scripts/check-migrations.mjs"], root);
  if (!res.ok) failures.push(`Migration lint fails for ${rel}:\n${res.output}`);
}

if (failures.length > 0) block(failures.join("\n\n"));
process.exit(0);
