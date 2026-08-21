const TRACKER_PATH = "/p/pony.js";
const COLLECT_PATH = "/p/api/send";
const TRACKER_ORIGIN = "https://cloud.umami.is/script.js";
const COLLECT_ORIGIN = "https://gateway.umami.is/api/send";
const WEBSITE_ID = "78bc9b17-4037-4a3f-97cc-7241f6bc0285";
const SITE_HOSTNAME = "ponymux.com";
const SITE_ORIGIN = `https://${SITE_HOSTNAME}`;
const MAX_EVENT_BYTES = 64 * 1024;
const EVENT_TYPES = new Set(["event", "identify", "performance"]);
const UPDATE_PATH_PREFIX = "/update/";
const LATEST_UPDATE_KEY = "latest.json";
const UPDATE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u;
const HTTP_DATE_PATTERNS = [
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u,
  /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/u,
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}| \d) (\d{2}:\d{2}:\d{2}) (\d{4})$/u,
];
const RFC850_WEEKDAYS = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

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

function updateKeyFromPath(pathname) {
  let key;
  try {
    key = decodeURIComponent(pathname.slice(UPDATE_PATH_PREFIX.length));
  } catch {
    return null;
  }

  return UPDATE_KEY_PATTERN.test(key) ? key : null;
}

function parseByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (!match || (!match[1] && !match[2])) return null;

  if (match[1]) {
    const offset = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(requestedEnd) ||
      offset >= size ||
      requestedEnd < offset
    ) {
      return null;
    }

    const end = Math.min(requestedEnd, size - 1);
    return { offset, length: end - offset + 1 };
  }

  const suffix = Number(match[2]);
  if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return null;
  const length = Math.min(suffix, size);
  return { offset: size - length, length };
}

function etagMatches(value, etag) {
  return value
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//u, ""))
    .some((candidate) => candidate === "*" || candidate === etag);
}

function parseHttpDate(value) {
  const matches = HTTP_DATE_PATTERNS.map((pattern) => pattern.exec(value));
  const dateFormat = matches.findIndex(Boolean);
  if (dateFormat === -1) return null;

  const timestamp = Date.parse(dateFormat === 2 ? `${value} GMT` : value);
  if (!Number.isFinite(timestamp)) return null;

  let canonical = value;
  if (dateFormat === 1) {
    const [, weekday, day, month, year, time] = matches[dateFormat];
    const fullYear = String(new Date(timestamp).getUTCFullYear());
    if (!fullYear.endsWith(year)) return null;
    canonical = `${RFC850_WEEKDAYS[weekday]}, ${day} ${month} ${fullYear} ${time} GMT`;
  } else if (dateFormat === 2) {
    const [, weekday, month, day, time, year] = matches[dateFormat];
    canonical = `${weekday}, ${day.trim().padStart(2, "0")} ${month} ${year} ${time} GMT`;
  }

  return new Date(timestamp).toUTCString() === canonical ? timestamp : null;
}

function ifRangeMatches(value, object) {
  if (!value) return true;
  if (value.startsWith("W/")) return false;
  if (value.startsWith('"')) return value === object.httpEtag;

  const date = parseHttpDate(value);
  return date !== null && new Date(date).toUTCString() === object.uploaded.toUTCString();
}

function updateHeaders(object, key, range) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  headers.set("X-Content-Type-Options", "nosniff");

  if (range) {
    headers.set("Content-Length", String(range.length));
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`
    );
  } else {
    headers.set("Content-Length", String(object.size));
  }

  if (key === "appcast.xml") {
    headers.set("Content-Type", "application/rss+xml; charset=utf-8");
    headers.set("Cache-Control", "no-cache, max-age=0, must-revalidate");
  } else if (key === LATEST_UPDATE_KEY) {
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store");
  } else if (key.endsWith(".dmg")) {
    headers.set("Content-Type", "application/x-apple-diskimage");
    headers.set("Content-Disposition", `attachment; filename="${key}"`);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  return headers;
}

async function serveUpdateAsset(request, env, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  const key = updateKeyFromPath(pathname);
  if (!key) return response(404, "Not found");

  const rangeHeader = request.method === "GET" ? request.headers.get("Range") : null;
  const ifNoneMatch = request.headers.get("If-None-Match");
  let metadata = null;

  if (request.method === "HEAD" || rangeHeader || ifNoneMatch) {
    metadata = await env.UPDATES.head(key);
    if (!metadata) return response(404, "Not found");

    if (ifNoneMatch && etagMatches(ifNoneMatch, metadata.httpEtag)) {
      const headers = updateHeaders(metadata, key);
      headers.delete("Content-Length");
      return new Response(null, { status: 304, headers });
    }

    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: updateHeaders(metadata, key) });
    }
  }

  let range = null;
  if (rangeHeader && ifRangeMatches(request.headers.get("If-Range"), metadata)) {
    range = parseByteRange(rangeHeader, metadata.size);
    if (!range) {
      return response(416, "Range not satisfiable", {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${metadata.size}`,
      });
    }
  }

  const object = await env.UPDATES.get(key, range ? { range } : undefined);
  if (!object) return response(404, "Not found");

  return new Response(object.body, {
    status: range ? 206 : 200,
    headers: updateHeaders(object, key, range),
  });
}

async function redirectToLatestDownload(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  const latest = await env.UPDATES.get(LATEST_UPDATE_KEY);
  if (!latest) return response(503, "Download not available yet");

  let manifest;
  try {
    manifest = await latest.json();
  } catch {
    return response(503, "Download not available yet");
  }

  const dmg = manifest?.dmg;
  if (typeof dmg !== "string" || !UPDATE_KEY_PATTERN.test(dmg) || !dmg.endsWith(".dmg")) {
    return response(503, "Download not available yet");
  }

  const location = new URL(`${UPDATE_PATH_PREFIX}${encodeURIComponent(dmg)}`, request.url);
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      Location: location.href,
    },
  });
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
    if (pathname.startsWith(UPDATE_PATH_PREFIX)) {
      return serveUpdateAsset(request, env, pathname);
    }
    if (pathname === "/download" || pathname === "/download/") {
      return redirectToLatestDownload(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
