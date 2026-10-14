import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { MANIFEST_PATH, PACKAGE_DIR, install, markersFor, readPackage } from "../install.js";
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

describe("install CLI", () => {
  const runInstall = (env) =>
    spawnSync(process.execPath, [join(PACKAGE_DIR, "install.js")], {
      env: { ...process.env, INIT_CWD: root, npm_lifecycle_event: "", ...env },
      encoding: "utf8",
    });

  beforeEach(() => {
    writeFileSync(join(root, "CLAUDE.md"), `${end}\n${begin}\n`);
  });

  it("warns and exits 0 during npm install (postinstall) so the consumer's install continues", () => {
    const run = runInstall({ npm_lifecycle_event: "postinstall" });

    assert.equal(run.status, 0);
    assert.match(run.stderr, /warning: CLAUDE\.md has 1/);
  });

  it("exits 1 when run by hand", () => {
    const run = runInstall({});

    assert.equal(run.status, 1);
    assert.match(run.stderr, /error: CLAUDE\.md has 1/);
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
