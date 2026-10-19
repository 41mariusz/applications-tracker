import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { MANIFEST_PATH, PACKAGE_DIR, STATUS_PATH, install, markersFor, readPackage } from "../install.js";
import { uninstall } from "../uninstall.js";

const pkg = readPackage();
const { begin, end } = markersFor(pkg.name);
const SKILL = join(".claude", "skills", "team-code-review", "SKILL.md");

let root;
const read = (path) => readFileSync(join(root, path), "utf8");
const countOf = (text, marker) => text.split(marker).length - 1;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ai-toolkit-consumer-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("install", () => {
  it("copies the skills, appends one rules block and records the package version", () => {
    install({ root });

    assert.equal(read(SKILL), readFileSync(join(PACKAGE_DIR, "skills", "team-code-review", "SKILL.md"), "utf8"));
    assert.equal(countOf(read("CLAUDE.md"), begin), 1);
    assert.equal(countOf(read("CLAUDE.md"), end), 1);
    const manifest = JSON.parse(read(MANIFEST_PATH));
    assert.equal(manifest.version, pkg.version);
    assert.deepEqual(manifest.skills, ["team-code-review"]);
    assert.ok(manifest.files.includes(SKILL));
  });

  it("keeps one block and the user's own text when run twice", () => {
    writeFileSync(join(root, "CLAUDE.md"), "# My project\n\nOwn rule.\n");

    install({ root });
    // Simulate a stale managed block from an older version.
    writeFileSync(
      join(root, "CLAUDE.md"),
      read("CLAUDE.md").replace(/(<!-- BEGIN [^>]+ -->\n)[\s\S]*?(\n<!-- END)/, "$1old rules$2"),
    );
    const result = install({ root });

    const text = read("CLAUDE.md");
    assert.equal(countOf(text, begin), 1);
    assert.ok(text.startsWith("# My project\n\nOwn rule.\n\n"));
    assert.ok(!text.includes("old rules"));
    assert.ok(text.includes(readFileSync(join(PACKAGE_DIR, "rules", "CLAUDE.md"), "utf8").trim()));
    assert.equal(result.claudeMd, "updated");
  });

  it("stops without changing anything when only one marker is present", () => {
    const broken = `# My project\n\n${begin}\nhand-edited, END marker deleted\n`;
    writeFileSync(join(root, "CLAUDE.md"), broken);

    assert.throws(() => install({ root }), /CLAUDE\.md has 1 .*BEGIN.* and 0 .*END/);
    assert.equal(read("CLAUDE.md"), broken);
    assert.equal(existsSync(join(root, ".claude")), false);
  });

  it("leaves an existing skill directory it did not install untouched", () => {
    mkdirSync(join(root, ".claude", "skills", "team-code-review"), { recursive: true });
    writeFileSync(join(root, SKILL), "my own skill\n");

    const result = install({ root });

    assert.equal(read(SKILL), "my own skill\n");
    assert.deepEqual(result.skills, []);
    assert.match(result.warnings[0], /team-code-review.*not installed by/);
  });

  it("does nothing in the toolkit's own directory", () => {
    const result = install({ root: PACKAGE_DIR });

    assert.match(result.skipped, /development checkout/);
    assert.equal(existsSync(join(PACKAGE_DIR, ".claude")), false);
    assert.equal(existsSync(join(PACKAGE_DIR, "CLAUDE.md")), false);
  });
});

describe("install recovery and guards", () => {
  it("owns the skill even when the first install fails halfway, so the next install repairs it", () => {
    writeFileSync(join(root, "CLAUDE.md"), "# My project\n");
    chmodSync(join(root, "CLAUDE.md"), 0o444);

    assert.throws(() => install({ root }), { code: "EACCES" });
    assert.deepEqual(JSON.parse(read(MANIFEST_PATH)).skills, ["team-code-review"]);

    chmodSync(join(root, "CLAUDE.md"), 0o644);
    const result = install({ root });

    assert.deepEqual(result.skills, ["team-code-review"]);
    assert.deepEqual(result.warnings, []);
    assert.equal(countOf(read("CLAUDE.md"), begin), 1);
  });

  it("refuses a CLAUDE.md symlink whose target is missing", () => {
    symlinkSync(join(root, "elsewhere", "CLAUDE.md"), join(root, "CLAUDE.md"));

    assert.throws(() => install({ root }), /symlink to a missing file/);
    assert.equal(existsSync(join(root, "elsewhere")), false);
  });

  it("refuses a CLAUDE.md that is not UTF-8 instead of rewriting its bytes", () => {
    const latin1 = Buffer.from([0x23, 0x20, 0x43, 0x61, 0x66, 0xe9, 0x0a]);
    writeFileSync(join(root, "CLAUDE.md"), latin1);

    assert.throws(() => install({ root }), /not valid UTF-8/);
    assert.deepEqual(readFileSync(join(root, "CLAUDE.md")), latin1);
  });

  it("reports a manifest that is not a JSON object as a fixable error", () => {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, MANIFEST_PATH), "null\n");

    assert.throws(() => install({ root }), /not a JSON object/);
  });
});

describe("install CLI", () => {
  // The CLI installs only as a project dependency, so run a copy that lives under node_modules.
  let installedCopy;
  const runInstall = (env, script = join(installedCopy, "install.js")) =>
    spawnSync(process.execPath, [script], {
      env: { ...process.env, INIT_CWD: root, npm_lifecycle_event: "", npm_config_global: "", ...env },
      encoding: "utf8",
    });

  beforeEach(() => {
    installedCopy = join(root, "node_modules", "@41mariusz", "ai-toolkit");
    for (const entry of ["package.json", "install.js", "uninstall.js", "skills", "rules"]) {
      cpSync(join(PACKAGE_DIR, entry), join(installedCopy, entry), { recursive: true });
    }
  });

  it("warns and exits 0 during npm install (postinstall) and records the error in the status file", () => {
    writeFileSync(join(root, "CLAUDE.md"), `${end}\n${begin}\n`);

    const run = runInstall({ npm_lifecycle_event: "postinstall" });

    assert.equal(run.status, 0);
    assert.match(run.stderr, /warning: CLAUDE\.md has 1/);
    const status = JSON.parse(read(STATUS_PATH));
    assert.equal(status.ok, false);
    assert.match(status.error, /CLAUDE\.md has 1/);
  });

  it("exits 1 when run by hand", () => {
    writeFileSync(join(root, "CLAUDE.md"), `${end}\n${begin}\n`);

    const run = runInstall({});

    assert.equal(run.status, 1);
    assert.match(run.stderr, /error: CLAUDE\.md has 1/);
  });

  it("records a successful install in the status file", () => {
    const run = runInstall({ npm_lifecycle_event: "postinstall" });

    assert.equal(run.status, 0);
    const status = JSON.parse(read(STATUS_PATH));
    assert.equal(status.ok, true);
    assert.equal(status.version, pkg.version);
  });

  it("installs nothing when the package is not under node_modules (development checkout, --prefix)", () => {
    const run = runInstall({ npm_lifecycle_event: "postinstall" }, join(PACKAGE_DIR, "install.js"));

    assert.equal(run.status, 0);
    assert.match(run.stdout, /not installed as a project dependency/);
    assert.equal(existsSync(join(root, ".claude")), false);
    assert.equal(existsSync(join(root, "CLAUDE.md")), false);
  });

  it("installs nothing on a global install", () => {
    const run = runInstall({ npm_lifecycle_event: "postinstall", npm_config_global: "true" });

    assert.match(run.stdout, /global install/);
    assert.equal(existsSync(join(root, ".claude")), false);
  });
});

describe("uninstall", () => {
  it("removes exactly what was installed and keeps the user's content", () => {
    writeFileSync(join(root, "CLAUDE.md"), "# My project\n");
    mkdirSync(join(root, ".claude", "skills", "my-skill"), { recursive: true });
    install({ root });

    const result = uninstall({ root });

    assert.deepEqual(result.skills, ["team-code-review"]);
    assert.equal(read("CLAUDE.md"), "# My project\n");
    assert.equal(existsSync(join(root, ".claude", "skills", "team-code-review")), false);
    assert.equal(existsSync(join(root, ".claude", "skills", "my-skill")), true);
    assert.equal(existsSync(join(root, MANIFEST_PATH)), false);
  });

  it("reports nothing to do without a manifest", () => {
    assert.deepEqual(uninstall({ root }), { nothing: true });
  });
});
