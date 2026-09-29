// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
//
// The app has no self sign-up, so the test user is created through the Supabase admin API.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — use a LOCAL Supabase only (CI does this);
// the service-role key bypasses RLS and must never be used by the app itself.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const company = `Smoke Corp ${Date.now()}`;
let applicationId = "";
let noteId = "";
const agreement = `Agreed rate ${Date.now()}`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to create the smoke-test user.");
  process.exit(1);
}

const otherEmail = `smoke-other-${Date.now()}@example.com`;

async function createUser(userEmail = email) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: userEmail, password, email_confirm: true }),
  });
  return { status: response.status, location: "", body: "" };
}
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    disposition: response.headers.get("content-disposition") ?? "",
    body: await response.text(),
  };
}

// Multipart upload (the CV endpoint takes a file), sharing the session cookies.
async function upload(path, fileName, type, content) {
  const body = new FormData();
  body.set("file", new Blob([content], { type }), fileName);
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: cookieHeader(), Origin: BASE_URL },
    body,
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

const cvContent = `%PDF-1.4 smoke CV ${Date.now()}`;
let cvId = "";

const hrContact = { hr_contact_name: "Anna Łukasik", hr_contact_phone: "+48 600 100 200" };
const editedFields = {
  company,
  position: "Senior Developer",
  salary_range: "18-24k",
  quoted_rate: "24k",
  ...hrContact,
};

function search(q) {
  return request(`/dashboard?q=${encodeURIComponent(q)}`);
}

function editApplication(form) {
  return request(`/api/applications/${applicationId}`, { method: "PATCH", form });
}

function details() {
  return request(`/applications/${applicationId}`);
}

function changeStatus(form) {
  return request(`/api/applications/${applicationId}/status`, { method: "POST", form });
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["signup page is gone", () => request("/auth/signup"), { status: 404 }],
  ["admin creates test account", () => createUser(), { status: 200 }],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=Nieprawid" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/dashboard" },
  ],
  ["home sends a signed-in user to the list", () => request("/"), { status: 302, location: "/dashboard" }],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["new application form renders", () => request("/applications/new"), { status: 200 }],
  [
    "new application without company is rejected",
    () => request("/api/applications", { method: "POST", form: { company: "", position: "Dev" } }),
    { status: 400, bodyIncludes: "Podaj nazwę firmy" },
  ],
  [
    "new application is saved",
    async () => {
      const result = await request("/api/applications", {
        method: "POST",
        form: { company, position: "Senior Developer", salary_range: "18-24k", quoted_rate: "22k", ...hrContact },
      });
      if (result.status === 201) applicationId = JSON.parse(result.body).id;
      return result;
    },
    { status: 201 },
  ],
  ["dashboard lists the new application", () => request("/dashboard"), { status: 200, bodyIncludes: company }],
  [
    "search finds it by company, ignoring case",
    () => search(company.toLowerCase()),
    { status: 200, bodyIncludes: 'data-testid="search-count">1<' },
  ],
  [
    "search finds it by HR name without Polish diacritics",
    () => search("lukasik"),
    { status: 200, bodyIncludes: 'data-testid="search-count">1<' },
  ],
  [
    "search finds it by HR phone in another format",
    () => search("600-100-200"),
    { status: 200, bodyIncludes: 'data-testid="search-count">1<' },
  ],
  [
    "search with no match says so",
    () => search("no-such-company-xyz"),
    { status: 200, bodyIncludes: 'data-testid="search-count">0<' },
  ],
  [
    "status moves forward, skipping a stage",
    () => changeStatus({ status: "interviews" }),
    { status: 200, bodyIncludes: "interviews" },
  ],
  ["status cannot move backward", () => changeStatus({ status: "sent" }), { status: 400 }],
  ["application can be closed", () => changeStatus({ status: "rejected" }), { status: 200 }],
  [
    "reverting a closed application needs confirmation",
    () => changeStatus({ status: "offer" }),
    { status: 409, bodyIncludes: "requiresConfirmation" },
  ],
  [
    "confirmed revert is accepted",
    () => changeStatus({ status: "offer", confirm: "true" }),
    { status: 200, bodyIncludes: "offer" },
  ],
  ["details page shows the application", details, { status: 200, bodyIncludes: company }],
  [
    "empty note is rejected",
    () =>
      request(`/api/applications/${applicationId}/notes`, {
        method: "POST",
        form: { kind: "phone_call", body: " ", noted_at: new Date().toISOString() },
      }),
    { status: 400, bodyIncludes: "body" },
  ],
  [
    "phone-call note is added",
    async () => {
      const result = await request(`/api/applications/${applicationId}/notes`, {
        method: "POST",
        form: { kind: "phone_call", body: agreement, noted_at: new Date().toISOString() },
      });
      if (result.status === 201) noteId = JSON.parse(result.body).id;
      return result;
    },
    { status: 201 },
  ],
  ["details page shows the note as the latest agreement", details, { status: 200, bodyIncludes: agreement }],
  [
    "note is edited",
    () =>
      request(`/api/notes/${noteId}`, {
        method: "PATCH",
        form: { kind: "phone_call", body: `${agreement} (updated)`, noted_at: new Date().toISOString() },
      }),
    { status: 200 },
  ],
  ["edited note keeps its previous version", details, { status: 200, bodyIncludes: "Poprzednie wersje" }],
  ["note is removed", () => request(`/api/notes/${noteId}`, { method: "DELETE" }), { status: 200 }],
  ["removed note stays on the timeline, crossed out", details, { status: 200, bodyIncludes: 'data-removed="true"' }],
  ["edit page renders", () => request(`/applications/${applicationId}/edit`), { status: 200, bodyIncludes: company }],
  [
    "edit without company is rejected",
    () => editApplication({ ...editedFields, company: "" }),
    { status: 400, bodyIncludes: "Podaj nazwę firmy" },
  ],
  [
    "quoted rate is changed with a reason",
    () => editApplication({ ...editedFields, rate_change_note: "after the tech interview" }),
    { status: 200, bodyIncludes: '"changed":1' },
  ],
  ["change log shows the old and new rate", details, { status: 200, bodyIncludes: 'line-through opacity-70">22k<' }],
  [
    "the reason lands on the notes timeline",
    details,
    { status: 200, bodyIncludes: "Zmiana stawki: 22k → 24k. after the tech interview" },
  ],
  [
    "saving without changes logs nothing",
    () => editApplication(editedFields),
    { status: 200, bodyIncludes: '"changed":0' },
  ],
  [
    "status filter shows only the selected statuses",
    () => request("/dashboard?status=offer"),
    { status: 200, bodyIncludes: 'data-testid="search-count">1<' },
  ],
  [
    "status filter hides other statuses",
    () => request("/dashboard?status=sent,rejected"),
    { status: 200, bodyIncludes: 'data-testid="search-count">0<' },
  ],
  [
    "a non-CV file is rejected",
    () => upload("/api/cv", "photo.png", "image/png", "not a cv"),
    { status: 400, bodyIncludes: "PDF i DOCX" },
  ],
  [
    "CV is uploaded to the library",
    async () => {
      const result = await upload("/api/cv", "CV Anna.pdf", "application/pdf", cvContent);
      if (result.status === 201) cvId = JSON.parse(result.body).file.id;
      return result;
    },
    { status: 201, bodyIncludes: '"reused":false' },
  ],
  [
    "the same file under another name is not stored twice",
    () => upload("/api/cv", "copy of my CV.pdf", "application/pdf", cvContent),
    { status: 200, bodyIncludes: '"reused":true' },
  ],
  [
    "CV is attached to the application",
    () => request(`/api/applications/${applicationId}/cv`, { method: "POST", form: { cv_file_id: cvId } }),
    { status: 200 },
  ],
  ["details page shows the attached CV", details, { status: 200, bodyIncludes: "CV Anna.pdf" }],
  ["attaching the CV is in the change log", details, { status: 200, bodyIncludes: "CV:" }],
  [
    "CV opens in the browser for preview",
    () => request(`/api/cv/${cvId}`),
    { status: 200, bodyIncludes: "%PDF", disposition: "inline" },
  ],
  [
    "CV can also be downloaded",
    () => request(`/api/cv/${cvId}?download=1`),
    { status: 200, bodyIncludes: "%PDF", disposition: "attachment" },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "anonymous user cannot save an application",
    () => request("/api/applications", { method: "POST", form: { company: "X", position: "Y" } }),
    { status: 401 },
  ],
  ["admin creates a second account", () => createUser(otherEmail), { status: 200 }],
  [
    "second user signs in",
    () => request("/api/auth/signin", { method: "POST", form: { email: otherEmail, password } }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "second user does not see the first user's application",
    () => request("/dashboard"),
    { status: 200, bodyExcludes: company },
  ],
  ["second user cannot open the first user's application", details, { status: 404, bodyExcludes: company }],
  [
    "second user cannot add a note to it",
    () =>
      request(`/api/applications/${applicationId}/notes`, {
        method: "POST",
        form: { kind: "comment", body: "intrusion", noted_at: new Date().toISOString() },
      }),
    { status: 404 },
  ],
  [
    "second user cannot edit the first user's application",
    () => editApplication({ ...editedFields, company: "hijacked" }),
    { status: 404 },
  ],
  ["second user cannot download the first user's CV", () => request(`/api/cv/${cvId}`), { status: 404 }],
  [
    "second user cannot attach the first user's CV",
    () => request(`/api/applications/${applicationId}/cv`, { method: "POST", form: { cv_file_id: cvId } }),
    { status: 404 },
  ],
  [
    "second user cannot edit the first user's note",
    () =>
      request(`/api/notes/${noteId}`, {
        method: "PATCH",
        form: { kind: "comment", body: "intrusion", noted_at: new Date().toISOString() },
      }),
    { status: 404 },
  ],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.bodyIncludes === undefined || actual.body.includes(expected.bodyIncludes)) &&
    (expected.bodyExcludes === undefined || !actual.body.includes(expected.bodyExcludes)) &&
    (expected.disposition === undefined || (actual.disposition ?? "").startsWith(expected.disposition));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""} ${expected.bodyIncludes ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
