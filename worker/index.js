const TRACKER_PATH = "/p/pony.js";
const COLLECT_PATH = "/p/api/send";
const TRACKER_ORIGIN = "https://cloud.umami.is/script.js";
const COLLECT_ORIGIN = "https://gateway.umami.is/api/send";
const WEBSITE_ID = "78bc9b17-4037-4a3f-97cc-7241f6bc0285";
const SITE_HOSTNAME = "ponymux.com";
const SITE_ORIGIN = `https://${SITE_HOSTNAME}`;
const MAX_EVENT_BYTES = 64 * 1024;
const EVENT_TYPES = new Set(["event", "identify", "performance"]);

function response(status, message, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function methodNotAllowed(allowed) {
  return response(405, "Method not allowed", { Allow: allowed.join(", ") });
}

function isTrustedBrowserRequest(request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== SITE_ORIGIN) return false;

  const fetchSite = request.headers.get("Sec-Fetch-Site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site";
}

function copyHeader(source, destination, name) {
  const value = source.get(name);
  if (value) destination.set(name, value);
}

function createCollectHeaders(request) {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: SITE_ORIGIN,
  });

  for (const name of [
    "Accept-Language",
    "User-Agent",
    "CF-Connecting-IP",
    "CF-IPCountry",
    "CF-Region-Code",
    "CF-IPCity",
  ]) {
    copyHeader(request.headers, headers, name);
  }

  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) {
    headers.set("X-Forwarded-For", clientIp);
    headers.set("X-Real-IP", clientIp);
  }

  return headers;
}

async function proxyTracker(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  let upstream;
  try {
    upstream = await fetch(TRACKER_ORIGIN, {
      headers: { Accept: "application/javascript" },
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 86400, "404": 60, "500-599": 0 },
      },
    });
  } catch {
    return response(502, "Tracker unavailable");
  }

  if (!upstream.ok) {
    return response(502, "Tracker unavailable");
  }

  const headers = new Headers(upstream.headers);
  for (const name of [
    "Content-Disposition",
    "Content-Security-Policy",
    "NEL",
    "Report-To",
    "Set-Cookie",
    "X-Frame-Options",
  ]) {
    headers.delete(name);
  }
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("Content-Type", "application/javascript; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

async function proxyCollect(request) {
  if (request.method === "OPTIONS") {
    if (!isTrustedBrowserRequest(request)) return response(403, "Forbidden");
    return new Response(null, {
      status: 204,
      headers: {
        Allow: "OPTIONS, POST",
        "Cache-Control": "no-store",
      },
    });
  }

  if (request.method !== "POST") return methodNotAllowed(["OPTIONS", "POST"]);
  if (!isTrustedBrowserRequest(request)) return response(403, "Forbidden");

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_EVENT_BYTES) return response(413, "Payload too large");

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return response(400, "Invalid payload");
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_EVENT_BYTES) {
    return response(413, "Payload too large");
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return response(400, "Invalid payload");
  }

  if (
    !EVENT_TYPES.has(event?.type) ||
    event?.payload?.website !== WEBSITE_ID ||
    event?.payload?.hostname !== SITE_HOSTNAME
  ) {
    return response(403, "Forbidden");
  }

  let upstream;
  try {
    upstream = await fetch(COLLECT_ORIGIN, {
      method: "POST",
      headers: createCollectHeaders(request),
      body: rawBody,
      redirect: "manual",
    });
  } catch {
    return response(502, "Collector unavailable");
  }

  const headers = new Headers(upstream.headers);
  for (const name of ["Content-Security-Policy", "NEL", "Report-To", "Set-Cookie"]) {
    headers.delete(name);
  }
  headers.set("Cache-Control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === TRACKER_PATH) return proxyTracker(request);
    if (pathname === COLLECT_PATH) return proxyCollect(request);
    if (pathname.startsWith("/p/")) return response(404, "Not found");

    return env.ASSETS.fetch(request);
  },
};
