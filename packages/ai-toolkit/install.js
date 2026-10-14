#!/usr/bin/env node
// Installs the toolkit into the consumer project: skills into .claude/skills/<name>/, the rules
// between sentinel markers in CLAUDE.md, and .claude/.ai-toolkit-manifest.json listing what it
// owns. Runs as postinstall (consumer root = INIT_CWD) or by hand as `npx ai-toolkit`.
// Idempotent; never touches skill directories or CLAUDE.md text it does not manage.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = join(".claude", ".ai-toolkit-manifest.json");
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** A problem the user has to fix (bad markers, broken manifest); reported without a stack trace. */
export class ToolkitError extends Error {
  name = "ToolkitError";
}

export function readPackage(packageDir = PACKAGE_DIR) {
  return JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
}

export function markersFor(packageName) {
  return { begin: `<!-- BEGIN ${packageName} -->`, end: `<!-- END ${packageName} -->` };
}

function countOf(text, marker) {
  return text.split(marker).length - 1;
}

/** Where the managed block is: none, or exactly one BEGIN before one END. Anything else throws. */
export function findManagedBlock(text, { begin, end }) {
  const begins = countOf(text, begin);
  const ends = countOf(text, end);
  if (begins === 0 && ends === 0) return null;
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (begins === 1 && ends === 1 && start < stop) return { start, stop: stop + end.length };
  throw new ToolkitError(
    `CLAUDE.md has ${begins} "${begin}" and ${ends} "${end}" marker(s); expected one of each, BEGIN first. ` +
      "Fix the managed block by hand (or delete both markers and everything between them), then run `npx ai-toolkit`.",
  );
}

/** CLAUDE.md text with the managed block appended or replaced. */
export function withRulesBlock(text, rules, markers) {
  const block = `${markers.begin}\n${rules.trim()}\n${markers.end}`;
  const found = findManagedBlock(text, markers);
  if (found) return text.slice(0, found.start) + block + text.slice(found.stop);
  if (text === "") return `${block}\n`;
  return `${text}${text.endsWith("\n") ? "\n" : "\n\n"}${block}\n`;
}

/** CLAUDE.md text without the managed block (the inverse of an append by withRulesBlock). */
export function withoutRulesBlock(text, markers) {
  const found = findManagedBlock(text, markers);
  if (!found) return text;
  const before = text.slice(0, found.start).replace(/\n\n$/, "\n");
  const after = text.slice(found.stop).replace(/^\n/, "");
  return before + after;
}

export function readManifest(root) {
  const path = join(root, MANIFEST_PATH);
  if (!existsSync(path)) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ToolkitError(
      `${MANIFEST_PATH} is not valid JSON (${error.message}); remove it and run \`npx ai-toolkit\`.`,
    );
  }
  const skills = Array.isArray(manifest.skills) ? manifest.skills : [];
  // A hand-edited manifest must never point the installer or uninstaller outside .claude/skills/.
  const badName = skills.find((name) => typeof name !== "string" || !SKILL_NAME.test(name));
  if (badName !== undefined)
    throw new ToolkitError(`${MANIFEST_PATH} lists an invalid skill name: ${JSON.stringify(badName)}.`);
  return { ...manifest, skills };
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function isInside(path, dir) {
  return path === dir || path.startsWith(dir + sep);
}

/** Installs into `root`; returns what happened. Throws ToolkitError before changing anything. */
export function install({ root, packageDir = PACKAGE_DIR }) {
  const rootDir = resolve(root);
  const ownDir = realpathSync(packageDir);
  if (isInside(existsSync(rootDir) ? realpathSync(rootDir) : rootDir, ownDir)) {
    return { skipped: "development checkout of the toolkit itself, nothing to install" };
  }

  const pkg = readPackage(packageDir);
  const markers = markersFor(pkg.name);
  const previous = readManifest(rootDir);
  const claudeMdPath = join(rootDir, "CLAUDE.md");
  const claudeMdBefore = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, "utf8") : "";
  // Computed before any write: bad markers stop the install with nothing changed.
  const claudeMdAfter = withRulesBlock(
    claudeMdBefore,
    readFileSync(join(packageDir, "rules", "CLAUDE.md"), "utf8"),
    markers,
  );

  const skillsDir = join(rootDir, ".claude", "skills");
  const owned = new Set(previous?.skills ?? []);
  const packaged = readdirSync(join(packageDir, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const installed = [];
  const warnings = [];

  for (const name of packaged) {
    const target = join(skillsDir, name);
    if (existsSync(target) && !owned.has(name)) {
      warnings.push(`.claude/skills/${name}/ exists and was not installed by ${pkg.name}; left untouched`);
      continue;
    }
    rmSync(target, { recursive: true, force: true });
    mkdirSync(skillsDir, { recursive: true });
    cpSync(join(packageDir, "skills", name), target, { recursive: true });
    installed.push(name);
  }
  // Skills this package used to ship but no longer does.
  for (const name of owned) {
    if (!packaged.includes(name)) rmSync(join(skillsDir, name), { recursive: true, force: true });
  }

  if (claudeMdAfter !== claudeMdBefore) writeFileSync(claudeMdPath, claudeMdAfter);

  const files = installed.flatMap((name) => listFiles(join(skillsDir, name))).map((path) => relative(rootDir, path));
  mkdirSync(dirname(join(rootDir, MANIFEST_PATH)), { recursive: true });
  const manifest = {
    package: pkg.name,
    version: pkg.version,
    installedAt: new Date().toISOString(),
    skills: installed,
    files: [...files, "CLAUDE.md (managed block)"],
  };
  writeFileSync(join(rootDir, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    version: pkg.version,
    skills: installed,
    warnings,
    claudeMd:
      claudeMdAfter === claudeMdBefore ? "unchanged" : claudeMdBefore.includes(markers.begin) ? "updated" : "added",
  };
}

/** The consumer project: where `npm install` was run (INIT_CWD), else the current directory. */
export function consumerRoot(env = process.env, cwd = process.cwd()) {
  return env.INIT_CWD || cwd;
}

/**
 * Runs an install/uninstall action as a CLI. During `npm install` (postinstall) a failure is a
 * warning and exit code 0, so the consumer's install never breaks; run by hand it is exit code 1.
 */
export function runCli(action, report) {
  const isPostinstall = process.env.npm_lifecycle_event === "postinstall";
  try {
    for (const line of report(action())) console.log(`[ai-toolkit] ${line}`);
    return 0;
  } catch (error) {
    const message = error instanceof ToolkitError ? error.message : (error.stack ?? String(error));
    if (isPostinstall) {
      console.warn(
        `[ai-toolkit] warning: ${message}\n[ai-toolkit] npm install continues; fix the problem and run \`npx ai-toolkit\`.`,
      );
      return 0;
    }
    console.error(`[ai-toolkit] error: ${message}`);
    return 1;
  }
}

/** True when this module is the script being run (npm bin entries are symlinks, so compare real paths). */
export function isMain(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

if (isMain(import.meta.url)) {
  process.exitCode = runCli(
    () => install({ root: consumerRoot() }),
    (result) =>
      result.skipped
        ? [result.skipped]
        : [
            `installed ${result.version}: skills ${result.skills.join(", ") || "none"}; CLAUDE.md rules ${result.claudeMd}`,
            ...result.warnings.map((warning) => `warning: ${warning}`),
          ],
  );
}
