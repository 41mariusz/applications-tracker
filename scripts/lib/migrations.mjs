// Pure, dependency-free rules for Supabase migrations, shared by the migration lint
// (scripts/check-migrations.mjs), the deploy gate and their Vitest tests. No I/O here.
// Why: production runs the previous code version on the new schema after every `db push`
// and after a `wrangler rollback`, so a new migration must not break that code (test-plan risk #2).

// Any characters after the underscore, as the Supabase CLI accepts (e.g. dashes).
const FILE_NAME = /^(\d{14})_.+\.sql$/;

/** The 14-digit version prefix of `YYYYMMDDHHmmss_name.sql`. Throws on a malformed name. */
export function migrationVersion(fileName) {
  const match = FILE_NAME.exec(fileName);
  if (!match) throw new Error(`Malformed migration file name: ${fileName} (expected YYYYMMDDHHmmss_name.sql)`);
  return match[1];
}

/** Versions of the given migration file names, in input order. Throws on a malformed name. */
export function migrationVersions(fileNames) {
  return fileNames.map(migrationVersion);
}

/**
 * Set difference both ways, sorted. Compares whole sets, not the maximum version, so a
 * migration with an older timestamp merged later is still reported as missing.
 */
export function compareMigrations(repoVersions, cloudVersions) {
  const repo = new Set(repoVersions);
  const cloud = new Set(cloudVersions);
  return {
    missing: [...repo].filter((v) => !cloud.has(v)).sort(),
    remoteOnly: [...cloud].filter((v) => !repo.has(v)).sort(),
  };
}

/**
 * The deploy gate's decision, from the repo versions and either the cloud versions or the reason
 * the cloud state could not be read. Fails closed: an unreadable state blocks like a missing
 * migration, but with a different title so the owner knows which one to fix.
 * Returns `{ ok, level: "error" | "warning" | "notice", title, message }`; messages are single-line.
 */
export function gateVerdict({ repo, cloud, error }) {
  if (error !== undefined || !Array.isArray(cloud)) {
    return {
      ok: false,
      level: "error",
      title: "Cannot read cloud migration state",
      message: String(error ?? "no cloud versions given"),
    };
  }
  // Every real project has applied migrations: an empty list means the wrong project or a reset history.
  if (cloud.length === 0) {
    return {
      ok: false,
      level: "error",
      title: "Cannot read cloud migration state",
      message: "no migrations returned — wrong project or empty history?",
    };
  }
  const { missing, remoteOnly } = compareMigrations(repo, cloud);
  if (missing.length > 0) {
    return {
      ok: false,
      level: "error",
      title: "Cloud DB missing migrations",
      message: `${missing.join(", ")} — run npx supabase db push, then re-run this job`,
    };
  }
  if (remoteOnly.length > 0) {
    return {
      ok: true,
      level: "warning",
      title: "Cloud DB has migrations not in the repo",
      message: `${remoteOnly.join(", ")} — applied in the cloud but absent from supabase/migrations; deploying anyway`,
    };
  }
  return {
    ok: true,
    level: "notice",
    title: "Cloud DB has every repo migration",
    message: `${repo.length} migration(s) applied in the cloud`,
  };
}

// Statements that break the previous code version. Each test gets one statement, lowercased,
// with comments removed, string and dollar-quoted bodies blanked and whitespace collapsed.
const RULES = [
  {
    // Also `alter table … drop <column>` without the optional COLUMN keyword (incl. `drop if exists`).
    rule: "drop",
    test: (s) =>
      /\bdrop\s+(?:materialized\s+view|table|column|function|procedure|type|domain|policy|view|index|constraint|trigger|sequence|schema)\b/.test(
        s,
      ) ||
      alterTableActions(s).some((action) => /^drop\s+\S/.test(action) && !DROP_ACTION_JUDGED_ELSEWHERE.test(action)),
  },
  { rule: "rename", test: (s) => /^alter\b.*\brename\b/.test(s) },
  {
    rule: "alter-type",
    test: (s) => /^alter\s+table\b/.test(s) && /\balter\s+(?:column\s+)?\S+\s+(?:set\s+data\s+)?type\b/.test(s),
  },
  { rule: "set-not-null", test: (s) => /\bset\s+not\s+null\b/.test(s) },
  {
    // Old inserts omit the column and relied on its default.
    rule: "drop-default",
    test: (s) => /^alter\s+table\b/.test(s) && /\balter\s+(?:column\s+)?\S+\s+drop\s+default\b/.test(s),
  },
  {
    rule: "not-null-without-default",
    test: (s) =>
      /^alter\s+table\b/.test(s) &&
      splitTopLevel(s).some(
        (clause) =>
          /\badd\s+(?!constraint\b|check\b|unique\b|primary\b|foreign\b|exclude\b)/.test(clause) &&
          /\bnot\s+null\b/.test(clause) &&
          !/\bdefault\b/.test(clause),
      ),
  },
  { rule: "create-or-replace-function", test: (s) => /^create\s+or\s+replace\s+function\b/.test(s) },
  { rule: "enum-add-value", test: (s) => /^alter\s+type\b.*\badd\s+value\b/.test(s) },
  {
    // `revoke execute on function … from public` stays allowed (the atomic-writes and keepalive
    // pattern: revoke from public, then grant to the app roles). From anon or authenticated it
    // breaks the old code, which calls the function as those roles.
    rule: "revoke",
    test: (s) =>
      /^revoke\b/.test(s) &&
      (!/^revoke\s+(?:grant\s+option\s+for\s+)?execute\s+on\s+function\b/.test(s) ||
        /\b(?:anon|authenticated)\b/.test(s.slice(s.lastIndexOf(" from ")))),
  },
  { rule: "check-constraint", test: (s) => /\badd\s+(?:constraint\s+\S+\s+)?check\b/.test(s) },
  {
    // Same class as a check: existing rows or old writes may violate it. A `references` on a new
    // nullable column (`add column x uuid references y`) is additive and stays allowed.
    rule: "unique-or-fk",
    test: (s) =>
      /\badd\s+constraint\s+\S+\s+(?:unique|foreign\s+key|references)\b/.test(s) ||
      /\badd\s+(?:unique|foreign\s+key)\b/.test(s) ||
      /^create\s+unique\s+index\b/.test(s),
  },
  // Data loss, against the "nothing is deleted" guardrail.
  { rule: "truncate-or-delete", test: (s) => /^(?:truncate|delete\s+from)\b/.test(s) },
  {
    // Can hide rows from the old code. A plain (permissive) `create policy` stays allowed.
    rule: "policy-change",
    test: (s) => /^alter\s+policy\b/.test(s) || /^create\s+policy\b.*\bas\s+restrictive\b/.test(s),
  },
];

export const MIGRATION_LINT_RULES = RULES.map((r) => r.rule);

// `alter table` drop actions with a rule of their own (column, constraint: the drop pattern above;
// default: drop-default) or that only loosen the column (not null, identity, expression).
const DROP_ACTION_JUDGED_ELSEWHERE = /^drop\s+(?:column|constraint|default|not\s+null|identity|expression)\b/;

// The comma-separated actions of an `alter table` statement, without the `alter table <name>` head.
function alterTableActions(statement) {
  if (!/^alter\s+table\b/.test(statement)) return [];
  const actions = statement.replace(/^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?\S+\s+/, "");
  return splitTopLevel(actions).map((action) => action.trim());
}

// `-- migration-lint: allow <rule> — <reason>`; the separator may be an em/en dash, "-" or "--".
const OVERRIDE = /--\s*migration-lint:\s*allow\s+([a-z]+(?:-[a-z]+)*)?(.*)$/i;
const OVERRIDE_REASON = /^\s*(?:—|–|--|-)\s*(\S.*)$/;

// Leading plpgsql block words before a statement inside a `do` body (`begin drop table x`).
// They are skipped, so the finding points at the statement's own line.
const PLPGSQL_PREFIX =
  /^(?:(?:begin|declare|else|loop|exception|(?:els)?if\b[\s\S]*?\bthen|when\b[\s\S]*?\bthen)\s+)+/i;

/**
 * Findings `{ line, rule, text }` for statements that would break the previous code version.
 * A simple scan, not a SQL parser: `--` and block comments are ignored, and string literals,
 * quoted identifiers and dollar-quoted bodies (`$$ … $$`, i.e. function bodies) are blanked
 * before the rules run, so a `drop` inside a plpgsql function body is not judged. The body of a
 * `do` block runs immediately, so its statements are judged like top-level ones (dynamic SQL in
 * `execute '…'` is not). Statements are split on `;` and may span lines; a finding points at the
 * statement's first line.
 * A reasoned override alone on its line suppresses a finding in a statement from the line below
 * through the statement's last line; an override sharing its line with code applies only to the
 * statement(s) ending on that line. An override without a reason (or naming an unknown rule) is
 * itself a finding.
 */
export function lintMigrationSql(sql) {
  return lintMigration(sql).findings;
}

/** `lintMigrationSql` plus `suppressed`: how many findings reasoned overrides silenced. */
export function lintMigration(sql) {
  const rawLines = sql.split("\n");
  const overrides = parseOverrides(rawLines);
  const findings = overrides.invalid;
  let suppressed = 0;
  const lineAt = (pos) => sql.slice(0, pos).split("\n").length;

  for (const { statement, start, end, scope } of collectStatements(sql, 0, sql.length, null)) {
    const startLine = lineAt(start);
    const endLine = lineAt(end);
    // A standalone override above a `do` block also covers the statements in its body.
    const firstLine = lineAt(scope ?? start);
    const covers = (o) => (o.inline ? o.line === endLine : o.line >= firstLine - 1 && o.line <= endLine);
    for (const { rule, test } of RULES) {
      if (!test(statement)) continue;
      if (overrides.valid.some((o) => o.rule === rule && covers(o))) suppressed += 1;
      else findings.push({ line: startLine, rule, text: rawLines[startLine - 1].trim() });
    }
  }
  return { findings: findings.sort((a, b) => a.line - b.line), suppressed };
}

// Normalised statements of sql[from, to) with absolute offsets; recurses into `do` bodies.
// `scope` is the start of the outermost `do` statement enclosing them (null at the top level).
function collectStatements(sql, from, to, scope) {
  const statements = [];
  for (const split of splitStatements(blankNonCode(sql.slice(from, to)))) {
    const { end } = split;
    let { text, start } = split;
    if (scope !== null) {
      const prefix = PLPGSQL_PREFIX.exec(text)?.[0].length ?? 0;
      text = text.slice(prefix);
      start += prefix;
    }
    const statement = text.replace(/\s+/g, " ").trim().toLowerCase();
    statements.push({ statement, start: from + start, end: from + end, scope });
    if (!/^do\b/.test(statement)) continue;
    // The blanked text keeps the dollar tags, so the first one opens the body.
    const tag = /\$(?:[A-Za-z_]\w*)?\$/.exec(text);
    if (!tag) continue;
    const bodyStart = from + start + tag.index + tag[0].length;
    const close = sql.indexOf(tag[0], bodyStart);
    const bodyEnd = close === -1 || close > from + end ? from + end : close;
    statements.push(...collectStatements(sql, bodyStart, bodyEnd, scope ?? from + start));
  }
  return statements;
}

function parseOverrides(rawLines) {
  const valid = [];
  const invalid = [];
  rawLines.forEach((raw, index) => {
    const match = OVERRIDE.exec(raw);
    if (!match) return;
    const line = index + 1;
    const rule = match[1]?.toLowerCase();
    const reason = OVERRIDE_REASON.exec(match[2]);
    if (!rule || !MIGRATION_LINT_RULES.includes(rule)) {
      invalid.push({ line, rule: "override-unknown-rule", text: raw.trim() });
    } else if (!reason) {
      invalid.push({ line, rule: "override-without-reason", text: raw.trim() });
    } else {
      // Code before the comment on the same line makes it an inline override.
      valid.push({ line, rule, inline: raw.slice(0, match.index).trim() !== "" });
    }
  });
  return { valid, invalid };
}

// Same length and line breaks as the input: comments become spaces; the contents of string
// literals, quoted identifiers and dollar-quoted bodies become "_" (so `;` inside them is inert).
function blankNonCode(sql) {
  let out = "";
  let i = 0;
  const keepNewlines = (text, fill) => text.replace(/[^\n]/g, fill);
  while (i < sql.length) {
    const rest = sql.slice(i);
    let end;
    if (rest.startsWith("--")) {
      end = sql.indexOf("\n", i);
      if (end === -1) end = sql.length;
      out += keepNewlines(sql.slice(i, end), " ");
      i = end;
      continue;
    }
    if (rest.startsWith("/*")) {
      end = sql.indexOf("*/", i + 2);
      end = end === -1 ? sql.length : end + 2;
      out += keepNewlines(sql.slice(i, end), " ");
      i = end;
      continue;
    }
    const dollar = /^\$(?:[A-Za-z_]\w*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      end = close === -1 ? sql.length : close + tag.length;
      out += tag + keepNewlines(sql.slice(i + tag.length, close === -1 ? end : close), "_");
      if (close !== -1) out += tag;
      i = end;
      continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote && sql[j + 1] === quote) j += 2;
        else if (sql[j] === quote) break;
        else j += 1;
      }
      out += quote + keepNewlines(sql.slice(i + 1, j), "_") + (j < sql.length ? quote : "");
      i = j + 1;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

// Statements of blanked code split on `;`: the text from its first non-space character to the
// `;` (or the end), with those offsets.
function splitStatements(code) {
  const statements = [];
  let from = 0;
  for (let i = 0; i <= code.length; i++) {
    if (i < code.length && code[i] !== ";") continue;
    const offset = code.slice(from, i).search(/\S/);
    if (offset !== -1) statements.push({ text: code.slice(from + offset, i), start: from + offset, end: i });
    from = i + 1;
  }
  return statements;
}

// Split an `alter table` statement into its comma-separated actions, ignoring commas in parentheses.
function splitTopLevel(statement) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of statement) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);
  return parts;
}
