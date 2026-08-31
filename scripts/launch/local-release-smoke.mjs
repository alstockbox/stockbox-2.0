const DEFAULT_BASE_URL = "http://localhost:3001";

const baseUrl = (process.env.STOCKBOX_SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

const routeExpectations = [
  { path: "/", mustContain: ["StockBox"] },
  { path: "/product", mustContain: ["StockBox"] },
  { path: "/pricing", mustContain: ["StockBox"] },
  { path: "/auth/signup", mustContain: ["StockBox"] },
  { path: "/auth/login", mustContain: ["StockBox"] },
  { path: "/analyze", mustContain: ["StockBox"] },
  { path: "/batch", mustContain: ["StockBox"] },
  { path: "/history", mustContain: ["StockBox"] },
  { path: "/compare", mustContain: ["StockBox"] },
  { path: "/watchlist", mustContain: ["StockBox"] },
  { path: "/portfolio", mustContain: ["StockBox"] },
  { path: "/docs/methodology", mustContain: ["methodology"] },
  { path: "/data-sources", mustContain: ["StockBox"] },
  { path: "/legal/terms", mustContain: ["StockBox"] },
  { path: "/legal/privacy", mustContain: ["StockBox"] },
  { path: "/legal/withdrawal-form", mustContain: ["StockBox"] },
  { path: "/contact", mustContain: ["StockBox"] },
  { path: "/feedback", mustContain: ["StockBox"] },
  { path: "/faq", mustContain: ["StockBox"] },
  { path: "/sample-analysis", mustContain: ["StockBox"] },
  { path: "/robots.txt", mustContain: ["User-agent"] },
  { path: "/sitemap.xml", mustContain: ["urlset"] },
  { path: "/api/health/providers", contentType: "application/json", json: true },
];

const authRedirectExpectations = [
  { path: "/settings", status: 307, location: "/auth/login" },
  { path: "/settings/billing", status: 307, location: "/auth/login" },
  { path: "/settings/profile", status: 307, location: "/auth/login" },
  { path: "/settings/security", status: 307, location: "/auth/login" },
  { path: "/affiliate", status: 307, location: "/auth/login" },
  { path: "/admin", status: 307, location: "/auth/login" },
];

const protectedExpectations = [
  { path: "/api/health/providers/market", allowedStatuses: [401, 403] },
];

const requiredHeaders = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
];

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  const text = await response.text();
  return { response, text };
}

async function checkRoute(expectation) {
  const { response, text } = await request(expectation.path);
  const contentType = response.headers.get("content-type") ?? "";
  const missingText = (expectation.mustContain ?? []).filter((needle) => !text.toLowerCase().includes(needle.toLowerCase()));
  const json = expectation.json && response.ok ? JSON.parse(text) : null;

  return {
    path: expectation.path,
    status: response.status,
    ok: response.status === 200 && missingText.length === 0 && (!expectation.contentType || contentType.includes(expectation.contentType)),
    length: text.length,
    contentType,
    missingText,
    json,
  };
}

async function checkProtectedRoute(expectation) {
  const { response, text } = await request(expectation.path);
  return {
    path: expectation.path,
    status: response.status,
    ok: expectation.allowedStatuses.includes(response.status),
    length: text.length,
    allowedStatuses: expectation.allowedStatuses,
  };
}

async function checkAuthRedirect(expectation) {
  const { response, text } = await request(expectation.path);
  const location = response.headers.get("location") ?? "";
  return {
    path: expectation.path,
    status: response.status,
    ok: response.status === expectation.status && location === expectation.location,
    length: text.length,
    location,
    expectedLocation: expectation.location,
  };
}

function classifySampleReport(text) {
  const hasFullReport = [
    "StockBox",
    "AAPL",
    "StockBox Score",
    "Confidence",
    "Sources",
  ].every((needle) => text.includes(needle));
  const hasUnavailableState = text.includes("temporarily unavailable") || text.includes("tillfälligt otillgänglig");
  return hasFullReport ? "full_report" : hasUnavailableState ? "env_required_unavailable_state" : "unexpected";
}

const [home, sample] = await Promise.all([request("/"), request("/sample-analysis")]);
const routes = [];
for (const expectation of routeExpectations) {
  routes.push(await checkRoute(expectation));
}

const authRedirects = [];
for (const expectation of authRedirectExpectations) {
  authRedirects.push(await checkAuthRedirect(expectation));
}

const protectedRoutes = [];
for (const expectation of protectedExpectations) {
  protectedRoutes.push(await checkProtectedRoute(expectation));
}

const securityHeaders = requiredHeaders.map((header) => ({
  header,
  present: home.response.headers.has(header),
  value: home.response.headers.get(header),
}));

const providerHealth = routes.find((route) => route.path === "/api/health/providers")?.json ?? null;
const sampleReportStatus = classifySampleReport(sample.text);

const result = {
  observedAt: new Date().toISOString(),
  baseUrl,
  routes,
  authRedirects,
  protectedRoutes,
  securityHeaders,
  providerHealth,
  sampleReportStatus,
  sampleReportNote:
    sampleReportStatus === "env_required_unavailable_state"
      ? "The immutable AAPL sample report requires Supabase service environment variables in local smoke runs."
      : null,
};

console.log(JSON.stringify(result, null, 2));

const failedRoutes = routes.filter((route) => !route.ok);
const failedAuthRedirects = authRedirects.filter((route) => !route.ok);
const failedProtectedRoutes = protectedRoutes.filter((route) => !route.ok);
const missingHeaders = securityHeaders.filter((header) => !header.present);
const failedSample = sampleReportStatus === "unexpected";

if (failedRoutes.length || failedAuthRedirects.length || failedProtectedRoutes.length || missingHeaders.length || failedSample) {
  process.exitCode = 1;
}
