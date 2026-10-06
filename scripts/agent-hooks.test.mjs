// Proof for the Claude Code hooks in .claude/hooks (test-plan Phase 4, /10x-configure-hook).
// Each case pipes a hook payload into the real script and asserts the exit code and the channel:
// Claude Code shows hook output to the agent only on exit 2 with the message on stderr.
// Every case works in a throwaway git repo; only the slow tools (eslint, vitest, astro check)
// are stubbed through a fake `npx` on PATH that reacts to markers in the files.
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HOOKS = path.resolve(import.meta.dirname, "../.claude/hooks");
const SETTINGS = path.resolve(import.meta.dirname, "../.claude/settings.json");

// Fake npx: eslint fails on LINT_ERROR in a given file, vitest fails on TEST_FAIL in any tracked
// or new .ts file, astro check fails on TYPE_ERROR; STUB_MISSING=<tool> makes that tool "not installed".
const FAKE_NPX = `#!/usr/bin/env node
const { readFileSync, existsSync } = require("node:fs");
const { execSync } = require("node:child_process");
const args = process.argv.slice(2).filter((a) => a !== "--no-install");
const tool = args[0];
if (process.env.STUB_MISSING === tool) { console.error("npm error npx canceled: " + tool + " not found"); process.exit(1); }
const files = () => execSync("git ls-files -co --exclude-standard", { encoding: "utf8" }).split("\\n").filter((f) => f && existsSync(f));
const has = (marker, list) => list.filter((f) => readFileSync(f, "utf8").includes(marker));
if (tool === "eslint") {
  const bad = has("LINT_ERROR", args.slice(1).filter((a) => !a.startsWith("--")));
  if (bad.length) { console.log(bad.map((f) => f + "\\n  1:1  error  LINT_ERROR marker").join("\\n")); process.exit(1); }
  process.exit(0);
}
if (tool === "vitest") {
  const bad = has("TEST_FAIL", files().filter((f) => f.endsWith(".ts")));
  if (bad.length) { console.log("FAIL " + bad.join(", ") + " > expected 1 to be 2"); process.exit(1); }
  process.exit(0);
}
if (tool === "astro") {
  const bad = has("TYPE_ERROR", files().filter((f) => f.endsWith(".ts")));
  if (bad.length) { console.log(bad[0] + ":1:1 - error ts(2322): TYPE_ERROR marker"); process.exit(1); }
  process.exit(0);
}
console.error("fake npx: unexpected " + args.join(" ")); process.exit(1);
`;

let base;
let repo;
let env;

function sh(cmd, cwd) {
  return spawnSync("sh", ["-c", cmd], { cwd, encoding: "utf8" });
}

function makeRepo(dir) {
  mkdirSync(path.join(dir, ".claude"), { recursive: true });
  cpSync(HOOKS, path.join(dir, ".claude/hooks"), { recursive: true });
  cpSync(SETTINGS, path.join(dir, ".claude/settings.json"));
  mkdirSync(path.join(dir, "scripts"), { recursive: true });
  // Stand-ins for the repo's own dependency-free checks.
  writeFileSync(path.join(dir, "scripts/check-ui-literals.mjs"), "process.exit(0);\n");
  writeFileSync(
    path.join(dir, "scripts/check-migrations.mjs"),
    `import { readdirSync, readFileSync } from "node:fs";
const bad = readdirSync("supabase/migrations").filter((f) => readFileSync("supabase/migrations/" + f, "utf8").includes("drop table"));
if (bad.length) { console.error("supabase/migrations/" + bad[0] + ":1 drop: drop table"); process.exit(1); }
`,
  );
  mkdirSync(path.join(dir, "src/lib"), { recursive: true });
  mkdirSync(path.join(dir, "supabase/migrations"), { recursive: true });
  writeFileSync(path.join(dir, "src/lib/math.ts"), "export const two = 2;\n");
  writeFileSync(path.join(dir, "supabase/migrations/20260101000000_init.sql"), "create table t (id int);\n");
  writeFileSync(path.join(dir, "README.md"), "# probe\n");
  sh("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", dir);
}

function hook(name, payload, { cwd = repo, extraEnv = {} } = {}) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  return spawnSync("node", [path.join(cwd, ".claude/hooks", name)], {
    cwd,
    input,
    encoding: "utf8",
    env: { ...env, ...extraEnv },
  });
}

const edit = (file, extra = {}) => ({
  tool_name: "Edit",
  session_id: "s1",
  cwd: repo,
  tool_input: { file_path: file },
  ...extra,
});
const write = (rel, text, dir = repo) => writeFileSync(path.join(dir, rel), text);

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), "agent-hooks-"));
  repo = path.join(base, "repo");
  mkdirSync(repo);
  makeRepo(repo);
  const bin = path.join(base, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "npx"), FAKE_NPX);
  chmodSync(path.join(bin, "npx"), 0o755);
  mkdirSync(path.join(base, "tmp"));
  env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    TMPDIR: path.join(base, "tmp"),
    CLAUDE_PROJECT_DIR: repo,
  };
  delete env.STUB_MISSING;
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("after-edit.mjs (PostToolUse Write|Edit)", () => {
  it("blocks on a lint error in the edited file and names it on stderr (exit 2)", () => {
    write("src/lib/math.ts", "export const two = 2; // LINT_ERROR\n");
    const res = hook("after-edit.mjs", edit(path.join(repo, "src/lib/math.ts")));
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("ESLint reported errors in src/lib/math.ts");
    expect(res.stdout).toBe("");
  });

  it("blocks when a test related to the edited file fails (behavioural, not type-only)", () => {
    write("src/lib/math.test.ts", "// TEST_FAIL\n");
    const res = hook("after-edit.mjs", edit(path.join(repo, "src/lib/math.ts")));
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("Tests related to src/lib/math.ts fail");
  });

  it("runs the migration lint when a migration is edited", () => {
    write("supabase/migrations/20260102000000_x.sql", "drop table t;\n");
    const res = hook("after-edit.mjs", edit(path.join(repo, "supabase/migrations/20260102000000_x.sql")));
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("Migration lint fails");
  });

  it("passes a clean file", () => {
    const res = hook("after-edit.mjs", edit(path.join(repo, "src/lib/math.ts")));
    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");
  });

  it("skips a type it does not check, a missing file and payloads without a path", () => {
    write("README.md", "LINT_ERROR TEST_FAIL\n");
    for (const payload of [
      edit(path.join(repo, "README.md")),
      edit(path.join(repo, "src/lib/gone.ts")),
      {},
      "not json",
      "",
      { tool_name: "Bash", cwd: repo, tool_input: { command: "ls" } },
    ]) {
      expect(hook("after-edit.mjs", payload).status).toBe(0);
    }
  });

  it("resolves a relative path against cwd", () => {
    write("src/lib/math.ts", "LINT_ERROR\n");
    const res = hook("after-edit.mjs", edit("src/lib/math.ts"));
    expect(res.status).toBe(2);
  });

  it("skips a broken file of another repository", () => {
    const other = path.join(base, "other");
    mkdirSync(other);
    makeRepo(other);
    write("src/lib/math.ts", "LINT_ERROR\n", other);
    expect(hook("after-edit.mjs", edit(path.join(other, "src/lib/math.ts"))).status).toBe(0);
  });

  it("fails visibly when the linter is not installed (no silent success)", () => {
    const res = hook("after-edit.mjs", edit(path.join(repo, "src/lib/math.ts")), {
      extraEnv: { STUB_MISSING: "eslint" },
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("not found");
  });
});

describe("end-of-turn.mjs (Stop)", () => {
  it("blocks on a lint error written outside the per-edit hook (e.g. through Bash) and names the file", () => {
    write("src/lib/math.ts", "LINT_ERROR\n");
    const res = hook("end-of-turn.mjs", { session_id: "s1", cwd: repo, stop_hook_active: false });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("src/lib/math.ts");
    expect(res.stderr).toContain("Fix these before you finish");
  });

  it("blocks on a type error and on a failing test in one message", () => {
    write("src/lib/math.ts", "export const two: number = '2'; // TYPE_ERROR\n");
    write("src/lib/math.test.ts", "// TEST_FAIL\n");
    const res = hook("end-of-turn.mjs", { cwd: repo });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("Typecheck (astro check) fails");
    expect(res.stderr).toContain("Unit tests fail");
  });

  it("lets the agent finish on the retry even while the error is present", () => {
    write("src/lib/math.ts", "LINT_ERROR\n");
    expect(hook("end-of-turn.mjs", { cwd: repo, stop_hook_active: true }).status).toBe(0);
    expect(hook("end-of-turn.mjs", { cwd: repo, loop_count: 1 }).status).toBe(0);
  });

  it("passes when nothing changed, when only docs changed, and on a clean change", () => {
    expect(hook("end-of-turn.mjs", { cwd: repo }).status).toBe(0);
    write("README.md", "LINT_ERROR\n");
    expect(hook("end-of-turn.mjs", { cwd: repo }).status).toBe(0);
    write("src/lib/math.ts", "export const two = 2 as const;\n");
    const res = hook("end-of-turn.mjs", { cwd: repo });
    expect(res.status).toBe(0);
    expect(res.stderr).toBe("");
  });

  it("fails visibly when the typechecker does not run (no silent success)", () => {
    write("src/lib/math.ts", "export const two = 2 as const;\n");
    const res = hook("end-of-turn.mjs", { cwd: repo }, { extraEnv: { STUB_MISSING: "astro" } });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("astro not found");
  });

  it("tolerates empty and invalid payloads", () => {
    expect(hook("end-of-turn.mjs", "").status).toBe(0);
    expect(hook("end-of-turn.mjs", "not json").status).toBe(0);
  });
});

describe("checkout resolution", () => {
  it("checks the session's checkout, not a stale CLAUDE_PROJECT_DIR that holds an error", () => {
    const other = path.join(base, "other");
    mkdirSync(other);
    makeRepo(other);
    write("src/lib/math.ts", "LINT_ERROR\n", other);
    const opts = { extraEnv: { CLAUDE_PROJECT_DIR: other } };
    expect(hook("after-edit.mjs", edit(path.join(repo, "src/lib/math.ts")), opts).status).toBe(0);
    expect(hook("end-of-turn.mjs", { cwd: repo }, opts).status).toBe(0);
  });

  it("sweeps a sibling worktree the session edited", () => {
    const wt = path.join(base, "wt");
    sh(`git worktree add -q --detach "${wt}"`, repo);
    write("src/lib/math.ts", "export const two = 2 as const;\n", wt);
    // The per-edit hook registers the worktree; the Stop hook (cwd = main checkout) sweeps it.
    expect(hook("after-edit.mjs", edit(path.join(wt, "src/lib/math.ts"))).status).toBe(0);
    write("src/lib/math.ts", "LINT_ERROR\n", wt);
    const res = hook("end-of-turn.mjs", { session_id: "s1", cwd: repo });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain(wt);
  });

  it("every settings.json command reaches its script from a worktree with a nonexistent CLAUDE_PROJECT_DIR", () => {
    const wt = path.join(base, "wt");
    sh(`git worktree add -q --detach "${wt}"`, repo);
    const settings = JSON.parse(readFileSync(path.join(repo, ".claude/settings.json"), "utf8"));
    const commands = Object.values(settings.hooks).flatMap((groups) =>
      groups.flatMap((g) => g.hooks.map((h) => h.command)),
    );
    expect(commands.length).toBe(2);
    for (const command of commands) {
      const res = spawnSync("sh", ["-c", command], {
        cwd: wt,
        input: "{}",
        encoding: "utf8",
        env: { ...env, CLAUDE_PROJECT_DIR: "/nonexistent" },
      });
      expect(res.status, `${command}: ${res.stderr}`).toBe(0);
    }
  });
});
