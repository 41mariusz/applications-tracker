// Pre-publish checks of the toolkit package (CI job `validate` in publish-ai-toolkit.yml; run locally the same way):
//   node scripts/validate-package.mjs
// Exits 1 with one line per failure: package.json fields, and for every skills/<dir>/SKILL.md a
// frontmatter with `name` (equal to <dir>) and `description`. The spec requires team-code-review.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_SKILL = "team-code-review";
const failures = [];

const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
for (const field of ["name", "version"]) {
  if (typeof pkg[field] !== "string" || pkg[field] === "") failures.push(`package.json: "${field}" is missing`);
}
if (typeof pkg.publishConfig?.registry !== "string") failures.push('package.json: "publishConfig.registry" is missing');

/** Top-level `key: value` lines of the YAML frontmatter, or null without one. */
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!match) return null;
  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim().replace(/^(["'])(.*)\1$/, "$2")]),
  );
}

const skillsDir = join(packageDir, "skills");
const skillDirs = existsSync(skillsDir)
  ? readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];
if (!skillDirs.includes(REQUIRED_SKILL)) failures.push(`skills/${REQUIRED_SKILL}/SKILL.md is missing`);

for (const dir of skillDirs) {
  const path = join(skillsDir, dir, "SKILL.md");
  if (!existsSync(path)) {
    failures.push(`skills/${dir}/SKILL.md is missing`);
    continue;
  }
  const meta = frontmatter(readFileSync(path, "utf8"));
  if (!meta) {
    failures.push(`skills/${dir}/SKILL.md has no YAML frontmatter`);
    continue;
  }
  if (!meta.name) failures.push(`skills/${dir}/SKILL.md: frontmatter "name" is missing`);
  else if (meta.name !== dir)
    failures.push(`skills/${dir}/SKILL.md: frontmatter name "${meta.name}" differs from its directory "${dir}"`);
  if (!meta.description) failures.push(`skills/${dir}/SKILL.md: frontmatter "description" is missing`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`::error title=ai-toolkit package::${failure}`);
  process.exit(1);
}
console.log(`ok: ${pkg.name}@${pkg.version}, skills: ${skillDirs.join(", ")}`);
