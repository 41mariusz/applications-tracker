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
    body: await response.text(),
  };
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
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/dashboard" },
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
        form: { company, position: "Senior Developer", salary_range: "18-24k", quoted_rate: "22k" },
      });
      if (result.status === 201) applicationId = JSON.parse(result.body).id;
      return result;
    },
    { status: 201 },
  ],
  ["dashboard lists the new application", () => request("/dashboard"), { status: 200, bodyIncludes: company }],
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
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.bodyIncludes === undefined || actual.body.includes(expected.bodyIncludes)) &&
    (expected.bodyExcludes === undefined || !actual.body.includes(expected.bodyExcludes));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""} ${expected.bodyIncludes ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
