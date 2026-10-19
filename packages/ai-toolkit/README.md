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
   - **In CI:** store a `read:packages` token as the secret `GH_PKG_TOKEN`, and give npm the auth line **before** `npm ci` runs. In GitHub Actions:

     ```yaml
     - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
       with:
         node-version: 24
         registry-url: "https://npm.pkg.github.com"
         scope: "@41mariusz"
     - run: npm ci
       env:
         NODE_AUTH_TOKEN: ${{ secrets.GH_PKG_TOKEN }}
     ```

     On other CI systems, write `//npm.pkg.github.com/:_authToken=${GH_PKG_TOKEN}` (literally, with single quotes) to the CI user's `~/.npmrc` in a step before `npm ci`. npm expands the variable at run time.

     Do not use a `preinstall` script for this. npm 7+ runs the root project's `preinstall` only after the dependencies have been fetched, so the token arrives too late and `npm ci` fails with 401.

3. Install:

   ```sh
   npm install --save-dev @41mariusz/ai-toolkit
   ```

npm 11 prints "install scripts not yet covered by allowScripts" for the toolkit's `postinstall`. As of npm 11.19 the script still runs. To approve it explicitly, and to stay ready for npm versions that block unapproved scripts, run `npm install-scripts approve @41mariusz/ai-toolkit`, or install the artifacts by hand with `npx ai-toolkit`.

## What the installer does

`postinstall` (or `npx ai-toolkit` by hand) works in the project where `npm install` ran (`INIT_CWD`):

- **Skills:** copies every skill to `.claude/skills/<name>/`.
  - A skill directory that the toolkit did not install itself is left alone, with a warning.
  - A directory the toolkit did install **belongs to the toolkit**: any local edit or extra file inside it is replaced on the next install and removed on uninstall. To customise a skill, copy it under another name.
- **Rules:** writes the rules between these markers in `CLAUDE.md`, creating the file if it is missing:

  ```
  <!-- BEGIN @41mariusz/ai-toolkit -->
  <!-- END @41mariusz/ai-toolkit -->
  ```

  - With no markers, the block is appended.
  - With exactly one `BEGIN` before one `END`, the block is replaced.
  - With anything else (one marker, duplicates, `END` first), it stops with a message and changes nothing. Fix the markers by hand and run `npx ai-toolkit`.

  - It refuses, with a message and no change, a `CLAUDE.md` that is not valid UTF-8, or a symlink whose target is missing or outside the project. A symlink to a file inside the project (for example `AGENTS.md`) is followed, and that file is edited.
  - The block is written with LF line endings. In a CRLF file it stays LF, and uninstall may leave one extra blank line.

- **Manifest:** writes `.claude/.ai-toolkit-manifest.json` with the package version and the installed files. Ownership is recorded _before_ anything is copied, so if an install fails halfway, the next `npx ai-toolkit` repairs it.
- **Status:** writes `.claude/.ai-toolkit-status.json`, with `ok: true` plus the installed version, or `ok: false` plus the error.
- **Idempotent:** a second run refreshes the managed content and never duplicates it.
- **Never breaks your install:** a problem during `npm install` does not fail it. npm hides the output of a dependency's install scripts, so the warning is not shown. After installing, check `.claude/.ai-toolkit-status.json`, or run `npx ai-toolkit`, which prints the result and exits 1 on an error.
- **Only as a project dependency:** it does nothing when the package does not sit in a `node_modules` directory (a development checkout, `npm install --prefix packages/ai-toolkit`) and on a global install (`npm i -g`).

## Uninstall

```sh
npx ai-toolkit-uninstall
npm uninstall @41mariusz/ai-toolkit
```

The uninstaller removes exactly what the manifest lists:

- the skill directories, whole, including anything you added inside them;
- the managed `CLAUDE.md` block;
- the manifest and the status file.

It never deletes `CLAUDE.md` itself, other skill directories, or any other file.

## Releasing

1. Bump `version` in `package.json`.
2. Merge to `main`.

The `Publish AI Toolkit` workflow (`.github/workflows/publish-ai-toolkit.yml`) validates the package and publishes the new version. If that version is already in the registry, the publish step is skipped.

## Development

```sh
cd packages/ai-toolkit
npm test   # node:test, no dependencies
```
