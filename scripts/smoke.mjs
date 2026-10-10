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
let activeNoteId = "";
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
// Fresh heartbeat first: a long-running local Supabase may hold a ping older than 24 h.
async function pingKeepalive() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/keepalive_ping`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  return { status: response.ok ? 200 : response.status, location: "", body: await response.text() };
}

// Health check is public: no session cookies.
async function health() {
  const response = await fetch(`${BASE_URL}/api/health`);
  const body = await response.text();
  let pingedAt = null;
  try {
    pingedAt = JSON.parse(body).pingedAt;
  } catch {
    // not JSON — the bodyIncludes check fails below
  }
  const parsable = typeof pingedAt === "string" && !Number.isNaN(Date.parse(pingedAt));
  return { status: response.status, location: "", body: parsable ? body : `unparsable pingedAt: ${body}` };
}

// Workers Issues → Telegram webhook, called by Cloudflare: application/json and no Origin header (the app's
// cross-site check must let exactly this through). No Telegram secrets locally or in CI, so nothing is sent.
const ISSUES_WEBHOOK_SECRET = process.env.ISSUES_WEBHOOK_SECRET ?? "smoke-webhook-secret";
const issuePayload = {
  name: "Workers issue",
  text: "New issue in applications-tracker: smoke test",
  data: {},
  ts: Math.floor(Date.now() / 1000),
  account_id: "smoke",
  policy_id: "smoke",
  policy_name: "Applications Tracker issues",
  alert_type: "workers_issue",
  alert_correlation_id: "smoke",
  alert_event: "issue_created",
};

async function issueAlert(secret, body = JSON.stringify(issuePayload)) {
  const response = await fetch(`${BASE_URL}/api/alerts/issue`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json", ...(secret === undefined ? {} : { "cf-webhook-auth": secret }) },
    body,
  });
  return { status: response.status, location: "", body: await response.text() };
}

// Browser failure report (src/lib/api-client.ts): sent like navigator.sendBeacon with a string body
// (text/plain, same-origin Origin header). `withSession: false` sends no cookies.
const clientReport = { kind: "test", op: "smoke", name: "Error", message: "smoke client report", path: "/dashboard" };

async function clientError(body, { withSession = true } = {}) {
  const response = await fetch(`${BASE_URL}/api/client-error`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: BASE_URL,
      "Content-Type": "text/plain;charset=UTF-8",
      ...(withSession ? { Cookie: cookieHeader() } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, location: "", body: await response.text() };
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

// A visitor without a session: no cookies sent or stored.
async function anonymous(path) {
  const response = await fetch(BASE_URL + path, { redirect: "manual" });
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
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

// A body that cannot be parsed (multipart without a boundary): the route must answer 400, not an empty 500.
async function malformedPost(path) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: cookieHeader(), Origin: BASE_URL, "Content-Type": "multipart/form-data" },
    body: "not a multipart body",
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

const cvContent = `%PDF-1.4 smoke CV ${Date.now()}`;
// Over the 5 MB CV limit: the server must refuse it before parsing the body.
const oversizedCv = new Uint8Array(5 * 1024 * 1024 + 100 * 1024).fill(0x20);
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

// List order on a clean account, compared with the PRD order. Three "sent" applications with the note on the
// middle one, and two closed pairs closed in opposite orders, so neither creation order (either way) nor a fixed
// order between Rejected and Withdrawn can pass for "most recent activity first".
const orderTag = `Order ${Date.now()}`;
const CLOSED = ["rejected", "withdrawn"];

async function checkListOrder() {
  const plan = [
    ["accepted", "accepted"],
    ["offer", "offer"],
    ["interviews", "interviews"],
    ["hr_contact", "hr_contact"],
    ["sent-oldest", "sent"],
    ["sent-noted", "sent"],
    ["sent-newest", "sent"],
    ["rejected-1", "rejected"],
    ["withdrawn-1", "withdrawn"],
    ["withdrawn-2", "withdrawn"],
    ["rejected-2", "rejected"],
  ];
  const companyById = new Map();
  const idByLabel = new Map();
  for (const [label] of plan) {
    const name = `${orderTag} [${label}]`;
    const created = await request("/api/applications", { method: "POST", form: { company: name, position: "Dev" } });
    if (created.status !== 201) return { ...created, body: `create ${label} failed: ${created.body}` };
    const { id } = JSON.parse(created.body);
    companyById.set(id, name);
    idByLabel.set(label, id);
  }
  // New applications start at "sent"; closed ones are closed from there in list order:
  // rejected-1, withdrawn-1, withdrawn-2, rejected-2 (the later one is the more recently active).
  for (const [label, status] of plan) {
    if (status === "sent") continue;
    const moved = await request(`/api/applications/${idByLabel.get(label)}/status`, {
      method: "POST",
      form: { status },
    });
    if (moved.status !== 200) return { ...moved, body: `move ${label} failed: ${moved.body}` };
  }
  // A note makes the middle "sent" application the most recently active one in its stage.
  const noted = await request(`/api/applications/${idByLabel.get("sent-noted")}/notes`, {
    method: "POST",
    form: { kind: "comment", body: "follow-up", noted_at: new Date().toISOString() },
  });
  if (noted.status !== 201) return { ...noted, body: `note failed: ${noted.body}` };

  const page = await request("/dashboard");
  const order = [];
  const missingStrike = [];
  for (const card of page.body.split("<li ").slice(1)) {
    const id = card.match(/href="\/applications\/([0-9a-f-]{36})"/)?.[1];
    if (!companyById.has(id)) continue;
    order.push(companyById.get(id));
    const status = card.match(/data-status="([a-z_]+)"/)?.[1];
    if (CLOSED.includes(status) && !card.includes("line-through")) missingStrike.push(companyById.get(id));
  }
  const strike = missingStrike.length ? ` | not crossed out: ${missingStrike.join(", ")}` : "";
  return { status: page.status, location: page.location, body: order.join(" > ") + strike };
}

const expectedOrder = [
  "accepted",
  "offer",
  "interviews",
  "hr_contact",
  "sent-noted",
  "sent-newest",
  "sent-oldest",
  "rejected-2",
  "withdrawn-2",
  "withdrawn-1",
  "rejected-1",
]
  .map((label) => `${orderTag} [${label}]`)
  .join(" > ");

const steps = [
  ["keepalive heartbeat is written", pingKeepalive, { status: 200 }],
  ["health check reports ok without a session", health, { status: 200, bodyIncludes: '"status":"ok"' }],
  ["issue alert without the webhook secret is refused", () => issueAlert(), { status: 401 }],
  ["issue alert with a wrong secret is refused", () => issueAlert("wrong-secret"), { status: 401 }],
  [
    "issue alert with the right secret is accepted (no Telegram configured)",
    () => issueAlert(ISSUES_WEBHOOK_SECRET),
    { status: 200, bodyIncludes: '"delivered":false' },
  ],
  ["issue alert with invalid JSON is rejected", () => issueAlert(ISSUES_WEBHOOK_SECRET, "{not json"), { status: 400 }],
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["signup page is gone", () => request("/auth/signup"), { status: 404 }],
  [
    "client error report without a session is refused",
    () => clientError(clientReport, { withSession: false }),
    { status: 401 },
  ],
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
  ["client error report from a signed-in user is accepted", () => clientError(clientReport), { status: 204 }],
  [
    "oversized client error report is refused",
    () => clientError({ ...clientReport, message: "x".repeat(5000) }),
    { status: 413 },
  ],
  [
    "client error report of an unknown kind is rejected",
    () => clientError({ ...clientReport, kind: "spam" }),
    { status: 400 },
  ],
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
    { status: 409, bodyIncludes: '"requiresConfirmation":true' },
  ],
  [
    "confirmed revert is accepted",
    () => changeStatus({ status: "offer", confirm: "true" }),
    { status: 200, bodyIncludes: "offer" },
  ],
  ["status cannot be set to the one it already has", () => changeStatus({ status: "offer" }), { status: 400 }],
  ["an offer can be accepted", () => changeStatus({ status: "accepted" }), { status: 200, bodyIncludes: "accepted" }],
  [
    "moving from one final status to another needs confirmation",
    () => changeStatus({ status: "withdrawn" }),
    { status: 409, bodyIncludes: '"requiresConfirmation":true' },
  ],
  ["confirmation must be explicit", () => changeStatus({ status: "withdrawn", confirm: "false" }), { status: 400 }],
  [
    "confirmed move between final statuses is accepted",
    () => changeStatus({ status: "withdrawn", confirm: "true" }),
    { status: 200, bodyIncludes: "withdrawn" },
  ],
  [
    "history marks the accepted → withdrawn move as a revert",
    details,
    { status: 200, bodyIncludes: 'Zaakceptowana → Wycofana<span class="text-warning"> (cofnięcie)' },
  ],
  [
    "a withdrawn application can be reopened with confirmation",
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
    "malformed note body is refused with 400",
    () => malformedPost(`/api/applications/${applicationId}/notes`),
    { status: 400, bodyIncludes: "Nieprawidłowe dane formularza" },
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
    "an oversized CV is refused before parsing",
    () => upload("/api/cv", "big CV.pdf", "application/pdf", oversizedCv),
    { status: 413, bodyIncludes: "za duży" },
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
    "CV library lists the CV with its usage",
    () => request("/cv"),
    { status: 200, bodyIncludes: 'data-usage-count="1"' },
  ],
  ["CV library knows which application uses it", () => request("/cv"), { status: 200, bodyIncludes: applicationId }],
  [
    "CV can also be downloaded",
    () => request(`/api/cv/${cvId}?download=1`),
    { status: 200, bodyIncludes: "%PDF", disposition: "attachment" },
  ],
  [
    "malformed application link is not found",
    () => request("/applications/abc"),
    { status: 404, bodyIncludes: "Nie znaleziono" },
  ],
  [
    // A mistyped id is "not found" before any query — not a logged 500 that would raise an alert.
    "malformed CV link in the API is not found",
    () => request("/api/cv/not-a-uuid"),
    { status: 404, bodyIncludes: "Nie znaleziono" },
  ],
  [
    "malformed application id in a write route is not found",
    () =>
      request("/api/applications/not-a-uuid/notes", {
        method: "POST",
        form: { kind: "comment", body: "Notatka do nieistniejącej aplikacji", noted_at: new Date().toISOString() },
      }),
    { status: 404, bodyIncludes: "Nie znaleziono" },
  ],
  [
    "application link sends an anonymous visitor to sign-in with a return path",
    () => anonymous(`/applications/${applicationId}`),
    { status: 302, location: `/auth/signin?next=%2Fapplications%2F${applicationId}` },
  ],
  [
    "signin returns to the requested application",
    () =>
      request("/api/auth/signin", {
        method: "POST",
        form: { email, password, next: `/applications/${applicationId}` },
      }),
    { status: 302, location: `/applications/${applicationId}` },
  ],
  [
    "signin refuses a return path to another site",
    () => request("/api/auth/signin", { method: "POST", form: { email, password, next: "//evil.com" } }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "a note that stays active is added",
    async () => {
      const result = await request(`/api/applications/${applicationId}/notes`, {
        method: "POST",
        form: { kind: "comment", body: `Active note ${Date.now()}`, noted_at: new Date().toISOString() },
      });
      if (result.status === 201) activeNoteId = JSON.parse(result.body).id;
      return result;
    },
    { status: 201 },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["CV library requires sign-in", () => request("/cv"), { status: 302, location: "/auth/signin" }],
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
  ["second user's CV library is empty", () => request("/cv"), { status: 200, bodyExcludes: "CV Anna.pdf" }],
  ["second user cannot download the first user's CV", () => request(`/api/cv/${cvId}`), { status: 404 }],
  [
    "second user cannot attach the first user's CV",
    () => request(`/api/applications/${applicationId}/cv`, { method: "POST", form: { cv_file_id: cvId } }),
    { status: 404 },
  ],
  [
    "second user cannot edit the first user's note",
    () =>
      request(`/api/notes/${activeNoteId}`, {
        method: "PATCH",
        form: { kind: "comment", body: "intrusion", noted_at: new Date().toISOString() },
      }),
    { status: 404 },
  ],
  [
    "second user cannot remove the first user's note",
    () => request(`/api/notes/${activeNoteId}`, { method: "DELETE" }),
    { status: 404 },
  ],
  ["second user cannot change the first user's status", () => changeStatus({ status: "accepted" }), { status: 404 }],
  [
    "list puts stages in order of importance, most recent activity first, closed ones last",
    checkListOrder,
    { status: 200, bodyIncludes: expectedOrder, bodyExcludes: "not crossed out" },
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
    console.log(`      actual body: ${actual.body.slice(0, 300)}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
