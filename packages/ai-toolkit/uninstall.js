#!/usr/bin/env node
// Removes exactly what install.js recorded in .claude/.ai-toolkit-manifest.json: the listed skill
// directories, the managed CLAUDE.md block and the manifest. Never deletes CLAUDE.md or other files.
//   npx ai-toolkit-uninstall
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  MANIFEST_PATH,
  PACKAGE_DIR,
  consumerRoot,
  isMain,
  markersFor,
  readManifest,
  readPackage,
  runCli,
  withoutRulesBlock,
} from "./install.js";

/** Uninstalls from `root`; returns what happened. Throws ToolkitError before changing anything. */
export function uninstall({ root, packageDir = PACKAGE_DIR }) {
  const rootDir = resolve(root);
  const manifest = readManifest(rootDir);
  if (!manifest) return { nothing: true };

  const markers = markersFor(manifest.package ?? readPackage(packageDir).name);
  const claudeMdPath = join(rootDir, "CLAUDE.md");
  const claudeMdBefore = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, "utf8") : null;
  // Computed before any removal: bad markers stop the uninstall with nothing changed.
  const claudeMdAfter = claudeMdBefore === null ? null : withoutRulesBlock(claudeMdBefore, markers);

  for (const name of manifest.skills)
    rmSync(join(rootDir, ".claude", "skills", name), { recursive: true, force: true });
  if (claudeMdAfter !== null && claudeMdAfter !== claudeMdBefore) writeFileSync(claudeMdPath, claudeMdAfter);
  rmSync(join(rootDir, MANIFEST_PATH), { force: true });

  return { skills: manifest.skills, claudeMd: claudeMdAfter !== claudeMdBefore ? "removed" : "untouched" };
}

if (isMain(import.meta.url)) {
  process.exitCode = runCli(
    () => uninstall({ root: consumerRoot() }),
    (result) =>
      result.nothing
        ? ["nothing installed (no manifest found)"]
        : [`removed skills ${result.skills.join(", ") || "none"}; CLAUDE.md rules ${result.claudeMd}`],
  );
}
