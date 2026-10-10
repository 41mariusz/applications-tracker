// Test data for manual testing: ~300 applications with notes, status history, rate edits and
// real CV files (PDFs) in the private "cvs" bucket, attached to many of the applications.
//
//   node scripts/demo-data.mjs                              # add test data for the only user in the project
//   node scripts/demo-data.mjs --clear-only                 # preview what a wipe would delete (deletes nothing)
//   node scripts/demo-data.mjs --clear-only --confirm=<e-mail>  # DELETE ALL of that user's data, add nothing
//   node scripts/demo-data.mjs --reset --confirm=<e-mail>   # DELETE ALL, then add test data again
//
// A wipe deletes the account's applications (with their notes and history), the CV library and the stored
// CV files — nothing can undo it. Without --confirm=<the account's e-mail> the destructive modes only
// preview. They refuse while applications without the "[TEST]" prefix exist, unless --include-real is given
// (rules: scripts/lib/demo-data-guard.mjs). The switch to real data (roadmap S-05) is the one sanctioned
// production wipe: `--clear-only --confirm=<owner e-mail>`, once, before the first real application.
//
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or .env. The service-role
// (secret) key bypasses RLS — it is only for this maintenance script and never for the app.
// Pick the account with DEMO_EMAIL=... when the project has more than one user.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { decideWipe, parseDemoArgs } from "./lib/demo-data-guard.mjs";

function loadDotEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
    }
  } catch {
    // no .env — rely on the environment
  }
}
loadDotEnv();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_EMAIL } = process.env;
const args = parseDemoArgs(process.argv.slice(2));
if (!args.ok) {
  console.error(args.error);
  process.exit(1);
}
const COUNT = 300;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the secret key) in .env or the environment.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Deterministic pseudo-random numbers, so every run produces the same data set.
let seed = 42;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const DAY = 24 * 60 * 60 * 1000;

const companies = [
  "Acme Software House",
  "Łódź Tech",
  "Gdańsk Data Labs",
  "Kraków Cloud",
  "Wrocław Devs",
  "Poznań FinTech",
  "Zielona Góra Systems",
  "Żabka Tech",
  "Marketplace Polska",
  "Bank Północny",
  "Insurtech Śląsk",
  "Mobile Studio Białystok",
  "HealthTech Lublin",
  "GameDev Katowice",
  "Logistics Szczecin",
  "E-commerce Toruń",
  "AI Startup Warszawa",
  "Consulting Rzeszów",
  "Telco Olsztyn",
  "Agencja Rekrutacyjna IT Hunters",
  "SaaS Kielce",
  "Energy Opole",
  "Retail Bydgoszcz",
  "Security Gliwice",
  "EdTech Sopot",
];
const positions = [
  "Junior Frontend Developer",
  "Frontend Developer",
  "Senior Frontend Developer",
  "Fullstack Developer",
  "Senior Fullstack Developer",
  "Backend Developer (Node.js)",
  "React Developer",
  "TypeScript Developer",
  "Tech Lead",
  "QA Automation Engineer",
];
const firstNames = [
  "Anna",
  "Katarzyna",
  "Małgorzata",
  "Agnieszka",
  "Ewa",
  "Paweł",
  "Łukasz",
  "Michał",
  "Tomasz",
  "Joanna",
  "Żaneta",
  "Grzegorz",
];
const lastNames = [
  "Łukasik",
  "Kowalska",
  "Nowak",
  "Wiśniewska",
  "Zieliński",
  "Wójcik",
  "Kamińska",
  "Lewandowski",
  "Szymańska",
  "Dąbrowski",
  "Żak",
  "Król",
];
const callNotes = [
  (rate) => `Pierwsza rozmowa z HR — podałem ${rate}, bez negocjacji na razie.`,
  () => "HR pytała o dostępność: od zaraz / 1 miesiąc wypowiedzenia.",
  () => "Ustalona rozmowa techniczna na przyszły tydzień, 60 min, live coding.",
  () => "Po rozmowie technicznej: feedback pozytywny, czekam na decyzję.",
  () => "HR potwierdziła widełki, praca hybrydowa 2 dni w biurze.",
  (rate) => `Rekruter zewnętrzny — klient końcowy nieujawniony, stawka do ${rate}.`,
  () => "Oddzwonić w piątek po 14:00.",
];
const comments = [
  "Ciekawy projekt, ale stary stack.",
  "Sprawdzić opinie o firmie.",
  "Znajomy tam pracuje — zapytać o zespół.",
  "Ogłoszenie wisi od miesiąca, może być problem.",
  "Benefity: prywatna opieka, karta sportowa.",
];
const PIPELINE = ["sent", "hr_contact", "interviews", "offer", "accepted"];

// Four CV versions: small but valid PDFs with a line of text each.
const cvVersions = [
  { fileName: "CV Frontend 2026.pdf", lines: ["CV - Frontend Developer", "React, TypeScript, Astro", "2026"] },
  { fileName: "CV Fullstack 2026.pdf", lines: ["CV - Fullstack Developer", "Node.js, React, PostgreSQL", "2026"] },
  { fileName: "CV Tech Lead.pdf", lines: ["CV - Tech Lead", "Team leadership, architecture", "2026"] },
  { fileName: "CV EN.pdf", lines: ["Curriculum Vitae (EN)", "Frontend / Fullstack Developer", "2026"] },
];

function makePdf(lines) {
  const text = lines.map((l, i) => `BT /F1 14 Tf 72 ${760 - i * 22} Td (${l}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function check(error, what) {
  if (error) {
    console.error(`${what} failed:`, error.message);
    process.exit(1);
  }
}

async function findUser() {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  check(error, "Listing users");
  const users = DEMO_EMAIL ? data.users.filter((u) => u.email === DEMO_EMAIL) : data.users;
  if (users.length !== 1) {
    console.error(
      DEMO_EMAIL
        ? `No user with email ${DEMO_EMAIL}.`
        : `Expected exactly one user, found ${data.users.length}. Set DEMO_EMAIL=... to choose one.`,
    );
    process.exit(1);
  }
  return users[0];
}

async function resetUser(userId) {
  // Applications cascade to notes, note revisions, status and field history.
  const { count, error } = await db.from("applications").delete({ count: "exact" }).eq("user_id", userId);
  check(error, "Deleting applications");

  const { data: files, error: listError } = await db.storage.from("cvs").list(userId, { limit: 1000 });
  check(listError, "Listing CV files");
  if (files.length > 0) {
    const { error: removeError } = await db.storage.from("cvs").remove(files.map((f) => `${userId}/${f.name}`));
    check(removeError, "Deleting CV files");
  }
  const { error: cvError } = await db.from("cv_files").delete().eq("user_id", userId);
  check(cvError, "Deleting the CV library");
  console.log(`Deleted ${count ?? 0} applications and ${files.length} CV files.`);
}

// What a wipe would delete: row counts per table (history and notes go with their applications) and the
// stored CV files. Head-only counts — no rows are fetched.
async function wipeSummary(userId) {
  const counts = {};
  for (const table of ["applications", "notes", "status_changes", "field_changes", "cv_files"]) {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
    check(error, `Counting ${table}`);
    counts[table] = count ?? 0;
  }
  const { data: files, error } = await db.storage.from("cvs").list(userId, { limit: 1000 });
  check(error, "Listing CV files");
  counts.stored_cv_files = files.length;
  return counts;
}

async function accountApplications(userId) {
  const { data, error } = await db.from("applications").select("company, position").eq("user_id", userId);
  check(error, "Reading applications");
  return data;
}

// --reset / --clear-only: preview, refuse or wipe — never without a matching --confirm (see the header).
async function guardedWipe(user) {
  const summary = await wipeSummary(user.id);
  const decision = decideWipe({
    mode: args.mode,
    confirm: args.confirm,
    includeReal: args.includeReal,
    accountEmail: user.email,
    applications: await accountApplications(user.id),
  });
  console.log(
    "Would delete:",
    Object.entries(summary)
      .map(([k, v]) => `${k}=${v}`)
      .join(", "),
  );
  if (decision.action === "refuse") {
    console.error(decision.reason);
    for (const example of decision.realExamples ?? []) console.error(`  - ${example}`);
    process.exit(1);
  }
  if (decision.action === "preview") {
    const flags = `--${args.mode}${args.includeReal ? " --include-real" : ""} --confirm=${user.email}`;
    console.log(`Preview only — nothing was deleted. To proceed: npm run demo-data -- ${flags}`);
    process.exit(0);
  }
  await resetUser(user.id);
}

async function uploadCvs(userId) {
  const library = [];
  for (const cv of cvVersions) {
    const bytes = makePdf(cv.lines);
    const sha256 = await sha256Hex(bytes);
    const path = `${userId}/${sha256}.pdf`;
    const { error } = await db.storage
      .from("cvs")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    check(error, `Uploading ${cv.fileName}`);
    const { data, error: rowError } = await db
      .from("cv_files")
      .upsert(
        {
          user_id: userId,
          sha256,
          file_name: cv.fileName,
          mime_type: "application/pdf",
          size_bytes: bytes.length,
          storage_path: path,
        },
        { onConflict: "user_id,sha256" },
      )
      .select("id, file_name")
      .single();
    check(rowError, `Saving ${cv.fileName}`);
    library.push(data);
  }
  return library;
}

function phoneFor(i) {
  const a = 500 + (i % 300);
  const b = String((i * 7) % 1000).padStart(3, "0");
  const c = String((i * 13) % 1000).padStart(3, "0");
  return [`+48 ${a} ${b} ${c}`, `${a}-${b}-${c}`, `0048${a}${b}${c}`, null][i % 4];
}

function buildData(userId, library) {
  const now = Date.now();
  const applications = [];
  const statusChanges = [];
  const notes = [];
  const fieldChanges = [];

  for (let i = 1; i <= COUNT; i++) {
    const id = crypto.randomUUID();
    const applied = new Date(now - Math.floor(random() * 90) * DAY);
    applied.setUTCHours(9, 0, 0, 0);
    const rateLow = 12 + Math.floor(random() * 14);
    const rate = `${rateLow + 3 + Math.floor(random() * 3)}k netto`;

    const r = random();
    const finalIdx = r < 0.35 ? 0 : r < 0.5 ? 1 : r < 0.64 ? 2 : r < 0.7 ? 3 : r < 0.71 ? 4 : Math.floor(random() * 3);
    const closed = r >= 0.71 ? (random() < 0.8 ? "rejected" : "withdrawn") : null;
    const hasContact = finalIdx >= 1 || i % 3 === 0;

    // Walk the status forward step by step, then close if closed. Steps stay strictly increasing and in the past.
    let at = applied.getTime();
    let last = at;
    const step = (from, to, days, n) => {
      at = Math.min(at + days * DAY, now - 60 * 60 * 1000 + n * 60 * 1000);
      statusChanges.push({
        application_id: id,
        user_id: userId,
        from_status: from,
        to_status: to,
        changed_at: new Date(at).toISOString(),
      });
      last = at;
    };
    for (let n = 1; n <= finalIdx; n++) step(PIPELINE[n - 1], PIPELINE[n], 2 + Math.floor(random() * 6), n);
    if (closed) step(PIPELINE[finalIdx], closed, 1 + Math.floor(random() * 5), 10);

    for (let n = 1; n <= Math.min(finalIdx + 1, 4); n++) {
      if (finalIdx === 0) break;
      const notedAt = Math.min(
        applied.getTime() + (n * 3 + Math.floor(random() * 3)) * DAY + 2 * 60 * 60 * 1000,
        now - 30 * 60 * 1000,
      );
      const iso = new Date(notedAt).toISOString();
      notes.push({
        application_id: id,
        user_id: userId,
        kind: "phone_call",
        body: callNotes[(i + n) % callNotes.length](rate),
        noted_at: iso,
        created_at: iso,
        updated_at: iso,
      });
      last = Math.max(last, notedAt);
    }
    if (i % 4 === 0) {
      const notedAt = Math.min(applied.getTime() + DAY + 11 * 60 * 60 * 1000, now - 20 * 60 * 1000);
      const iso = new Date(notedAt).toISOString();
      notes.push({
        application_id: id,
        user_id: userId,
        kind: "comment",
        body: comments[i % comments.length],
        noted_at: iso,
        created_at: iso,
        updated_at: iso,
      });
      last = Math.max(last, notedAt);
    }
    const quotedRate = i % 5 === 0 ? null : rate;
    if (i % 10 === 0 && quotedRate) {
      fieldChanges.push({
        application_id: id,
        user_id: userId,
        field: "quoted_rate",
        old_value: `${rateLow + 1}k netto`,
        new_value: quotedRate,
        changed_at: new Date(Math.min(last + DAY, now - 10 * 60 * 1000)).toISOString(),
      });
    }

    // Most applications that went past "sent" have a CV attached, logged like a user action.
    const cv = finalIdx >= 1 || random() < 0.4 ? library[i % library.length] : null;
    if (cv) {
      fieldChanges.push({
        application_id: id,
        user_id: userId,
        field: "cv",
        old_value: null,
        new_value: cv.file_name,
        changed_at: new Date(applied.getTime() + 5 * 60 * 1000).toISOString(),
      });
    }

    applications.push({
      id,
      user_id: userId,
      company: `[TEST] ${pick(companies)}`,
      position: positions[(i * 7) % positions.length],
      posting_url: i % 3 === 0 ? null : `https://example.com/oferta/${i}`,
      salary_range: `${rateLow}–${rateLow + 6}k netto ${i % 2 === 0 ? "B2B" : "UoP"}`,
      quoted_rate: quotedRate,
      hr_contact_name: hasContact ? `${firstNames[i % 12]} ${lastNames[(i * 5) % 12]}` : null,
      hr_contact_phone: hasContact ? phoneFor(i) : null,
      applied_on: applied.toISOString().slice(0, 10),
      employment_type: i % 2 === 0 ? "b2b" : "employment_contract",
      work_mode: ["remote", "hybrid", "onsite"][i % 3],
      status: closed ?? PIPELINE[finalIdx],
      cv_file_id: cv?.id ?? null,
      created_at: applied.toISOString(),
      updated_at: new Date(last).toISOString(),
      last_activity_at: new Date(last).toISOString(),
    });
  }
  return { applications, statusChanges, notes, fieldChanges };
}

async function insertAll(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 500));
    check(error, `Inserting into ${table}`);
  }
}

const user = await findUser();
console.log(`Account: ${user.email} (${SUPABASE_URL})`);
if (args.mode !== "seed") await guardedWipe(user);
if (args.mode === "clear-only") {
  console.log("Account cleared; no test data added.");
  process.exit(0);
}
const library = await uploadCvs(user.id);
const data = buildData(user.id, library);
await insertAll("applications", data.applications);
await insertAll("status_changes", data.statusChanges);
await insertAll("notes", data.notes);
await insertAll("field_changes", data.fieldChanges);
console.log(
  `Added ${data.applications.length} applications, ${data.notes.length} notes, ${data.statusChanges.length} status changes, ` +
    `${data.fieldChanges.length} field changes and ${library.length} CV files ` +
    `(attached to ${data.applications.filter((a) => a.cv_file_id).length} applications).`,
);
