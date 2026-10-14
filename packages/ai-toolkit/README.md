# @41mariusz/ai-toolkit

The team's AI artifacts for Claude Code, distributed as a private npm package through GitHub Packages (10xDevs M5L4, "Shared AI Registry"):

| Artifact                   | Installed to                        | What it is                                                                                                                                                                                |
| -------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/team-code-review/` | `.claude/skills/team-code-review/`  | A code-review skill that checks changes against `references/conventions.md`. It reports findings by severity with `file:line` and ends with APPROVE / REQUEST CHANGES / NEEDS DISCUSSION. |
| `rules/CLAUDE.md`          | a managed block in your `CLAUDE.md` | Short team rules that point agents at the review standard.                                                                                                                                |

The skill is called `team-code-review`, not `code-review`, because Claude Code ships a built-in `code-review` skill and a same-named project skill would compete with it.

## Install in a consumer repository

1. Map the scope to GitHub Packages in the repository's committed `.npmrc`. It holds **only** this line, never a token:

   ```
   @41mariusz:registry=https://npm.pkg.github.com
   ```

2. Authenticate. GitHub Packages requires a token even to read a package:
   - **Locally:** run `npm login --scope=@41mariusz --registry=https://npm.pkg.github.com` with your GitHub user name and a classic token with `read:packages`. Alternatively, put `//npm.pkg.github.com/:_authToken=<token>` in your **user-level** `~/.npmrc`, never in the repository.
   - **In CI:** store the token as the secret `GH_PKG_TOKEN` and add this `preinstall` script to the consumer's `package.json`. It appends the auth line only on the CI machine. The installer does not add it for you.

     ```bash
     [ -n "$GH_PKG_TOKEN" ] && echo '//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}' >> .npmrc || true
     ```

3. Install:

   ```sh
   npm install --save-dev @41mariusz/ai-toolkit
   ```

npm 11 prints "install scripts not yet covered by allowScripts" for the toolkit's `postinstall`. As of npm 11.19 the script still runs. To approve it explicitly, and to stay ready for npm versions that block unapproved scripts, run `npm install-scripts approve @41mariusz/ai-toolkit`, or install the artifacts by hand with `npx ai-toolkit`.

## What the installer does

`postinstall` (or `npx ai-toolkit` by hand) works in the project where `npm install` ran (`INIT_CWD`):

- **Skills:** copies every skill to `.claude/skills/<name>/`. A skill directory that the toolkit did not install itself is left alone, with a warning.
- **Rules:** writes the rules between these markers in `CLAUDE.md`, creating the file if it is missing:

  ```
  <!-- BEGIN @41mariusz/ai-toolkit -->
  <!-- END @41mariusz/ai-toolkit -->
  ```

  - With no markers, the block is appended.
  - With exactly one `BEGIN` before one `END`, the block is replaced.
  - With anything else (one marker, duplicates, `END` first), it stops with a message and changes nothing. Fix the markers by hand and run `npx ai-toolkit`.

- **Manifest:** writes `.claude/.ai-toolkit-manifest.json` with the package version and the installed files.
- **Idempotent:** a second run refreshes the managed content and never duplicates it.
- **Never breaks your install:** during `npm install` a problem is printed as a warning and the install continues. Run by hand, the same problem exits with code 1.
- **Development checkout:** in the package's own directory it does nothing.

## Uninstall

```sh
npx ai-toolkit-uninstall
npm uninstall @41mariusz/ai-toolkit
```

The uninstaller removes exactly what the manifest lists: the skill directories, the managed `CLAUDE.md` block and the manifest itself. It never deletes `CLAUDE.md` or files it did not install.

## Releasing

1. Bump `version` in `package.json`.
2. Merge to `main`.

The `Publish AI Toolkit` workflow (`.github/workflows/publish-ai-toolkit.yml`) validates the package and publishes the new version. If that version is already in the registry, the publish step is skipped.

## Development

```sh
cd packages/ai-toolkit
npm test   # node:test, no dependencies
```
