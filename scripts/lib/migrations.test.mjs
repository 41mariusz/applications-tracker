import { describe, expect, it } from "vitest";
import {
  compareMigrations,
  gateVerdict,
  lintMigration,
  lintMigrationSql,
  MIGRATION_LINT_RULES,
  migrationVersions,
} from "./migrations.mjs";

const rules = (sql) => lintMigrationSql(sql).map((f) => f.rule);

describe("migrationVersions", () => {
  it("reads the 14-digit prefix of each file name", () => {
    expect(migrationVersions(["20260929180000_create_applications.sql", "20261004120000_keepalive.sql"])).toEqual([
      "20260929180000",
      "20261004120000",
    ]);
  });

  it("accepts any characters after the underscore, as the Supabase CLI does", () => {
    expect(migrationVersions(["20261006130000_add-x.sql"])).toEqual(["20261006130000"]);
  });

  it.each([
    "foo.sql",
    "2026_x.sql",
    "2026092918000_short_prefix.sql",
    "20260929180000-dash.sql",
    "20260929180000_name.txt",
    "create_applications.sql",
    "20260929180000_.sql",
  ])("throws on the malformed name %j", (name) => {
    expect(() => migrationVersions([name])).toThrow(/Malformed migration file name/);
  });
});

describe("compareMigrations", () => {
  it("reports repo versions missing in the cloud", () => {
    expect(compareMigrations(["1", "2", "3"], ["1"])).toEqual({ missing: ["2", "3"], remoteOnly: [] });
  });

  it("reports cloud versions missing in the repo", () => {
    expect(compareMigrations(["1"], ["1", "4"])).toEqual({ missing: [], remoteOnly: ["4"] });
  });

  it("reports both directions at once, sorted", () => {
    expect(compareMigrations(["30", "10", "20"], ["40", "10"])).toEqual({ missing: ["20", "30"], remoteOnly: ["40"] });
  });

  it("reports no difference for equal sets", () => {
    expect(compareMigrations(["20261004120000", "20260929180000"], ["20260929180000", "20261004120000"])).toEqual({
      missing: [],
      remoteOnly: [],
    });
  });

  it("catches a migration with an older timestamp merged later (a max()-only check would miss it)", () => {
    const repo = ["20260929180000", "20261001090000", "20261004120000"];
    const cloud = ["20260929180000", "20261004120000"];
    expect(compareMigrations(repo, cloud).missing).toEqual(["20261001090000"]);
  });
});

describe("gateVerdict", () => {
  const repo = ["20260929180000", "20261004120000", "20261006120000"];

  it("blocks when the cloud lacks repo migrations and names them", () => {
    const verdict = gateVerdict({ repo, cloud: ["20260929180000"] });
    expect(verdict).toMatchObject({ ok: false, level: "error", title: "Cloud DB missing migrations" });
    expect(verdict.message).toMatch(/^20261004120000, 20261006120000 — run npx supabase db push/);
  });

  it("blocks an unreadable cloud state with a different title, carrying the reason", () => {
    const verdict = gateVerdict({ repo, error: "HTTP 404" });
    expect(verdict).toEqual({
      ok: false,
      level: "error",
      title: "Cannot read cloud migration state",
      message: "HTTP 404",
    });
  });

  it("blocks when no cloud versions are given at all (fail closed)", () => {
    expect(gateVerdict({ repo })).toMatchObject({ ok: false, title: "Cannot read cloud migration state" });
  });

  it("treats an empty cloud list as unreadable, not as every migration missing", () => {
    expect(gateVerdict({ repo, cloud: [] })).toEqual({
      ok: false,
      level: "error",
      title: "Cannot read cloud migration state",
      message: "no migrations returned — wrong project or empty history?",
    });
  });

  it("only warns about cloud versions absent from the repo", () => {
    const verdict = gateVerdict({ repo, cloud: [...repo, "20990101000000"] });
    expect(verdict).toMatchObject({ ok: true, level: "warning" });
    expect(verdict.message).toMatch(/^20990101000000 — /);
  });

  it("passes equal sets and reports the count", () => {
    expect(gateVerdict({ repo, cloud: [...repo].reverse() })).toMatchObject({
      ok: true,
      level: "notice",
      message: "3 migration(s) applied in the cloud",
    });
  });
});

describe("lintMigrationSql: breaking statements", () => {
  const breaking = [
    ["drop", "drop table public.notes;"],
    ["drop", "alter table public.applications drop column quoted_rate;"],
    ["drop", "drop function public.add_note(uuid, public.note_kind, text, timestamptz);"],
    ["drop", "drop type public.work_mode;"],
    ["drop", 'drop policy "notes_update_own" on public.notes;'],
    ["drop", "drop view public.application_summary;"],
    ["drop", "drop index public.cv_files_user_id_sha256_key;"],
    ["drop", "alter table public.cv_files drop constraint cv_files_user_id_sha256_key;"],
    ["drop", "alter table public.applications drop quoted_rate;"],
    ["drop", "alter table x drop if exists b;"],
    ["drop", "alter table public.applications add column source text, drop quoted_rate;"],
    ["drop", "do $$ begin drop table x; end $$;"],
    ["drop", "do $body$\ndeclare n int;\nbegin\n  if true then\n    drop table public.tmp;\n  end if;\nend\n$body$;"],
    ["rename", "do language plpgsql $$ begin alter table public.notes rename to n2; end $$;"],
    ["rename", "alter table public.notes rename to application_notes;"],
    ["rename", "alter table public.applications rename column quoted_rate to rate;"],
    ["rename", "alter type public.application_status rename value 'hr_contact' to 'screening';"],
    ["alter-type", "alter table public.applications alter column applied_on type timestamptz;"],
    ["alter-type", "alter table public.applications alter column salary_range set data type varchar(50);"],
    ["set-not-null", "alter table public.applications alter column posting_url set not null;"],
    ["not-null-without-default", "alter table public.applications add column source text not null;"],
    [
      "create-or-replace-function",
      "create or replace function public.add_note() returns uuid language sql as $$ select null::uuid $$;",
    ],
    ["enum-add-value", "alter type public.application_status add value 'ghosted';"],
    ["revoke", "revoke update on table public.notes from authenticated;"],
    ["revoke", "revoke update (deleted_at) on public.notes from authenticated;"],
    ["revoke", "revoke all on table public.keepalive from anon, authenticated;"],
    ["revoke", "revoke execute on function public.add_note(uuid) from anon;"],
    ["revoke", "revoke execute on function public.add_note(uuid) from authenticated;"],
    ["revoke", "revoke execute on function public.f() from public, anon;"],
    ["check-constraint", "alter table public.applications add constraint company_short check (length(company) < 50);"],
    ["drop-default", "alter table public.applications alter column status drop default;"],
    ["drop-default", "alter table public.applications alter status drop default;"],
    ["unique-or-fk", "alter table public.applications add constraint company_role_key unique (company, role);"],
    [
      "unique-or-fk",
      "alter table public.notes add constraint notes_app_fk foreign key (application_id) references public.applications (id);",
    ],
    ["unique-or-fk", "alter table public.applications add unique (posting_url);"],
    ["unique-or-fk", "alter table public.notes add foreign key (application_id) references public.applications (id);"],
    ["unique-or-fk", "create unique index applications_posting_url_key on public.applications (posting_url);"],
    ["truncate-or-delete", "truncate public.notes;"],
    ["truncate-or-delete", "delete from public.notes where deleted_at is not null;"],
    ["policy-change", 'alter policy "notes_select_own" on public.notes using (false);'],
    [
      "policy-change",
      'create policy "notes_hide" on public.notes as restrictive for select to authenticated using (deleted_at is null);',
    ],
  ];

  it.each(breaking)("flags %s in %j", (rule, sql) => {
    expect(rules(sql)).toEqual([rule]);
  });

  it.each(breaking)("passes %s with a reasoned override on the line above (%j)", (rule, sql) => {
    expect(lintMigrationSql(`-- migration-lint: allow ${rule} — old code never reads it\n${sql}`)).toEqual([]);
  });

  it("passes with an override on the same line", () => {
    expect(
      rules("alter table public.applications drop column quoted_rate; -- migration-lint: allow drop - probe"),
    ).toEqual([]);
  });

  it("an override sharing its line with code applies only to the statement ending on that line", () => {
    expect(lintMigrationSql("drop table a; -- migration-lint: allow drop — x\ndrop table b;")).toEqual([
      { line: 2, rule: "drop", text: "drop table b;" },
    ]);
  });

  it("an override inside a do body applies to the statement below it", () => {
    expect(rules("do $$\nbegin\n  -- migration-lint: allow drop — scratch table\n  drop table x;\nend\n$$;")).toEqual(
      [],
    );
  });

  it("reports how many findings the overrides suppressed", () => {
    const sql = "-- migration-lint: allow drop — x\ndrop table a;\ntruncate public.notes;";
    expect(lintMigration(sql)).toEqual({
      findings: [{ line: 3, rule: "truncate-or-delete", text: "truncate public.notes;" }],
      suppressed: 1,
    });
  });

  it("exports every rule name", () => {
    expect(MIGRATION_LINT_RULES).toEqual([
      "drop",
      "rename",
      "alter-type",
      "set-not-null",
      "drop-default",
      "not-null-without-default",
      "create-or-replace-function",
      "enum-add-value",
      "revoke",
      "check-constraint",
      "unique-or-fk",
      "truncate-or-delete",
      "policy-change",
    ]);
  });

  it("accepts '--' as the separator before the reason", () => {
    expect(rules("-- migration-lint: allow drop -- probe\ndrop table public.notes;")).toEqual([]);
  });

  it("reports the statement's first line, file line numbers included", () => {
    const sql =
      "-- header\ncreate table public.a (id int);\n\nalter table public.applications\n  drop column quoted_rate;\n";
    expect(lintMigrationSql(sql)).toEqual([{ line: 4, rule: "drop", text: "alter table public.applications" }]);
  });

  it("detects a multi-line add column … not null", () => {
    expect(rules("alter table public.applications\n  add column source text\n  not null;")).toEqual([
      "not-null-without-default",
    ]);
  });

  it("flags only the clause without a default in a multi-action alter table", () => {
    const sql =
      "alter table public.applications add column a int not null default 0, add column b numeric(10, 2) not null;";
    expect(rules(sql)).toEqual(["not-null-without-default"]);
  });

  it("is case-insensitive", () => {
    expect(rules("ALTER TABLE public.applications DROP COLUMN quoted_rate;")).toEqual(["drop"]);
  });

  it("an override without a reason is itself a finding and suppresses nothing", () => {
    expect(rules("-- migration-lint: allow drop\ndrop table public.notes;")).toEqual([
      "override-without-reason",
      "drop",
    ]);
    expect(rules("-- migration-lint: allow drop —   \ndrop table public.notes;")).toEqual([
      "override-without-reason",
      "drop",
    ]);
  });

  it("an override naming an unknown rule is a finding", () => {
    expect(rules("-- migration-lint: allow everything — trust me\ndrop table public.notes;")).toEqual([
      "override-unknown-rule",
      "drop",
    ]);
  });

  it("an override for another rule does not suppress the finding", () => {
    expect(rules("-- migration-lint: allow rename — wrong rule\ndrop table public.notes;")).toEqual(["drop"]);
  });

  it("an override two lines above the statement does not apply", () => {
    expect(rules("-- migration-lint: allow drop — too far\n\ndrop table public.notes;")).toEqual(["drop"]);
  });
});

describe("lintMigrationSql: additive statements pass", () => {
  it.each([
    "create table public.tags (id uuid primary key default gen_random_uuid(), name text not null check (length(name) > 0));",
    "alter table public.applications add column source text null;",
    "alter table public.applications add column source text;",
    "alter table public.applications add column priority int not null default 0;",
    "alter table public.applications\n  add column cv_file_id uuid references public.cv_files (id);",
    "create function public.f() returns int language sql as $$ select 1 $$;",
    "create index applications_user_id_idx on public.applications (user_id);",
    'create policy "tags_select_own" on public.tags for select to authenticated using (user_id = (select auth.uid()));',
    "grant execute on function public.f() to authenticated;",
    "revoke execute on function public.f() from public;",
    "revoke execute on function public.applied_migrations() from public;",
    "alter table x alter column y drop not null;",
    "alter table public.applications alter column id drop identity;",
    "alter table public.applications alter column total drop expression;",
    "alter table public.applications add column cv_file_id uuid references public.cv_files (id);",
    "create index notes_app_idx on public.notes (application_id);",
    "do $$ begin perform 1; end $$;",
    "alter table public.tags enable row level security;",
    "alter table public.applications alter column posting_url drop not null;",
  ])("passes %j", (sql) => {
    expect(lintMigrationSql(sql)).toEqual([]);
  });

  it("does not judge a create function body that a do block does not run", () => {
    expect(rules("create function public.h() returns void language plpgsql as $$ begin drop table x; end $$;")).toEqual(
      [],
    );
  });

  it("ignores breaking words in comments, strings and function bodies", () => {
    const sql = [
      "-- we never drop table public.notes",
      "/* alter type x add value 'y'; */",
      "insert into public.log (msg) values ('drop table public.notes; revoke all on table x from y');",
      "create function public.g() returns void language plpgsql as $body$",
      "begin",
      "  drop table public.tmp;",
      "  alter table public.applications drop column quoted_rate;",
      "end;",
      "$body$;",
    ].join("\n");
    expect(lintMigrationSql(sql)).toEqual([]);
  });
});
