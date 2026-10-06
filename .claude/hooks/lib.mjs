// Shared helpers for the Claude Code hooks in this directory (Node, no dependencies: the host has no jq).
// Claude Code shows hook output to the agent only on exit code 2 with the message on stderr.
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Plain output for a model reader: hooks inherit the user's shell env (FORCE_COLOR, GREP_OPTIONS).
export const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

// What `eslint .` covers here (eslint.config.js: js/jsx/ts/tsx, scripts/**/*.mjs, *.astro).
export const LINTED = /\.(ts|tsx|js|jsx|mjs|cjs|astro)$/;
// What Vitest picks up as source (vitest.config.ts includes src/**/*.test.ts and scripts/**/*.test.mjs).
export const TESTED = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
export const MIGRATION = /^supabase\/migrations\/[^/]+\.sql$/;

// The payload is untrusted in shape: empty stdin, invalid JSON or missing fields mean "nothing to check".
export function readPayload() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return {};
  }
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const raw = `${res.stdout ?? ""}${res.stderr ?? ""}${res.error ? String(res.error.message) : ""}`;
  // Some tools colour regardless of NO_COLOR (astro check): strip ANSI escapes for the model.
  // eslint-disable-next-line no-control-regex
  const output = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
  return { ok: res.status === 0 && !res.error, output };
}

export function git(args, cwd) {
  const res = run("git", args, cwd);
  return res.ok ? res.output : null;
}

// Repository identity shared by every worktree of the same repo.
export function commonDir(dir) {
  return git(["rev-parse", "--path-format=absolute", "--git-common-dir"], dir);
}

export function sessionId(payload) {
  return String(payload.session_id ?? "").replace(/[^A-Za-z0-9_-]/g, "");
}

function registryPath(sid) {
  return path.join(process.env.TMPDIR || tmpdir(), "claude-hooks", `${sid}.roots`);
}

// Checkouts edited in this session, so the Stop hook sweeps sibling worktrees too.
export function registerRoot(sid, root) {
  if (!sid) return;
  try {
    mkdirSync(path.dirname(registryPath(sid)), { recursive: true });
    appendFileSync(registryPath(sid), `${root}\n`);
  } catch {
    // The Stop hook still sweeps the session cwd.
  }
}

export function registeredRoots(sid) {
  if (!sid) return [];
  try {
    return readFileSync(registryPath(sid), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function clearRegistry(sid) {
  if (!sid) return;
  try {
    writeFileSync(registryPath(sid), "");
  } catch {
    // Nothing registered.
  }
}

// Blocking feedback: the only combination Claude Code shows to the agent.
export function block(message) {
  process.stderr.write(`${message.trim()}\n`);
  process.exit(2);
}
