// UI contract guard: views already moved to design tokens must not get literal colours or arbitrary
// values back. Dependency-free; runs as part of `npm run lint`. Same scan as the /10x-ui audit.
// When another view moves to tokens (see CLAUDE.md "UI contract"), add its files to CLEAN_VIEWS.
import { readFileSync } from "node:fs";

const CLEAN_VIEWS = [
  "src/pages/applications/[id]/index.astro",
  "src/components/Topbar.astro",
  "src/components/applications/StatusControl.tsx",
  "src/components/applications/NotesPanel.tsx",
  "src/components/applications/CvPanel.tsx",
  "src/layouts/Layout.astro",
  "src/pages/404.astro",
  "src/pages/500.astro",
  "src/pages/dev/ui.astro",
  "src/pages/dashboard.astro",
  "src/components/applications/ApplicationCard.astro",
  "src/components/applications/list-classes.ts",
  "src/components/applications/CvPreview.tsx",
  "src/components/applications/CvFileActions.tsx",
  "src/components/applications/CvUploadBox.tsx",
  "src/components/ErrorBoundary.tsx",
  "src/components/ErrorText.tsx",
  "src/pages/applications/new.astro",
  "src/pages/applications/[id]/edit.astro",
  "src/components/applications/ApplicationForm.tsx",
  "src/components/applications/form-classes.ts",
];

const LITERAL =
  /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;

const hits = [];
for (const file of CLEAN_VIEWS) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (LITERAL.test(line)) hits.push(`${file}:${index + 1}: ${line.trim()}`);
    });
}

if (hits.length > 0) {
  console.error("Literal colours or arbitrary values in views that use design tokens:");
  for (const hit of hits) console.error(`  ${hit}`);
  console.error("Use token classes from src/styles/global.css and components from src/components/ui (see CLAUDE.md).");
  process.exit(1);
}
console.log(`UI contract: ${CLEAN_VIEWS.length} views use tokens only.`);
