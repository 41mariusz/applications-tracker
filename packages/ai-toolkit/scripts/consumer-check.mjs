// End-to-end check of the packed toolkit in a throwaway consumer (CI job `validate`; run locally the same way):
//   npm pack && node scripts/consumer-check.mjs <tarball>
// A real `npm install <tarball>` exercises postinstall with INIT_CWD, then `npx ai-toolkit`
// (idempotency) and `npx ai-toolkit-uninstall`. Exits 1 on the first failed expectation.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// GitHub cuts an annotation at its first newline; escape like scripts/check-cloud-migrations.mjs.
const escapeAnnotation = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

const tarballArg = process.argv[2];
if (!tarballArg || !existsSync(tarballArg)) {
  console.error(`Usage: node scripts/consumer-check.mjs <tarball>${tarballArg ? ` (not found: ${tarballArg})` : ""}`);
  process.exit(2);
}
const tarball = resolve(tarballArg);
const pkg = JSON.parse(execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }));
const begin = `<!-- BEGIN ${pkg.name} -->`;
const consumer = mkdtempSync(join(tmpdir(), "ai-toolkit-consumer-check-"));

function npm(args) {
  // Env without npm_* lifecycle variables, so the consumer behaves like a fresh shell.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("npm_")));
  return execFileSync("npm", args, { cwd: consumer, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ok: ${message}`);
}

const blocks = () => readFileSync(join(consumer, "CLAUDE.md"), "utf8").split(begin).length - 1;
const skill = join(consumer, ".claude", "skills", "team-code-review", "SKILL.md");
const manifestPath = join(consumer, ".claude", ".ai-toolkit-manifest.json");
const statusPath = join(consumer, ".claude", ".ai-toolkit-status.json");

try {
  writeFileSync(join(consumer, "CLAUDE.md"), "# Consumer project\n");
  npm(["init", "-y"]);

  console.log(`npm install ${tarball}`);
  npm(["install", "--no-audit", "--no-fund", tarball]);
  expect(existsSync(skill), "postinstall copied .claude/skills/team-code-review/SKILL.md");
  expect(blocks() === 1, "CLAUDE.md has exactly one managed block");
  expect(
    readFileSync(join(consumer, "CLAUDE.md"), "utf8").startsWith("# Consumer project\n"),
    "consumer's own CLAUDE.md text kept",
  );
  expect(
    JSON.parse(readFileSync(manifestPath, "utf8")).version === pkg.version,
    `manifest records version ${pkg.version}`,
  );
  expect(JSON.parse(readFileSync(statusPath, "utf8")).ok === true, "status file records a successful postinstall");

  console.log("npx ai-toolkit (second install)");
  npm(["exec", "--no", "--", "ai-toolkit"]);
  expect(blocks() === 1, "still one managed block after a second install");

  console.log("npx ai-toolkit-uninstall");
  npm(["exec", "--no", "--", "ai-toolkit-uninstall"]);
  expect(
    !existsSync(skill) && !existsSync(manifestPath) && !existsSync(statusPath),
    "uninstall removed the skill, the manifest and the status file",
  );
  expect(readFileSync(join(consumer, "CLAUDE.md"), "utf8") === "# Consumer project\n", "uninstall restored CLAUDE.md");
  console.log("consumer check passed");
} catch (error) {
  console.error(`::error title=ai-toolkit consumer check::${escapeAnnotation(error.message)}`);
  if (error.stderr) console.error(String(error.stderr));
  process.exitCode = 1;
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
