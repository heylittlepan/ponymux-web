import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "./index.js";

const encoder = new TextEncoder();

function storedObject(key, value, contentType) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const metadata = {
    key,
    size: bytes.byteLength,
    httpEtag: `"etag-${key}"`,
    uploaded: new Date("2026-08-21T00:00:00Z"),
    writeHttpMetadata(headers) {
      if (contentType) headers.set("Content-Type", contentType);
    },
  };

  return { bytes, metadata };
}

class FakeBucket {
  constructor(entries) {
    this.entries = new Map(entries.map((entry) => [entry.metadata.key, entry]));
    this.headCalls = 0;
  }

  async head(key) {
    this.headCalls += 1;
    return this.entries.get(key)?.metadata ?? null;
  }

  async get(key, options) {
    const entry = this.entries.get(key);
    if (!entry) return null;

    const range = options?.range;
    const bytes = range
      ? entry.bytes.slice(range.offset, range.offset + range.length)
      : entry.bytes;

    return {
      ...entry.metadata,
      body: new Blob([bytes]).stream(),
      async json() {
        return JSON.parse(new TextDecoder().decode(bytes));
      },
    };
  }
}

function createEnv() {
  return {
    UPDATES: new FakeBucket([
      storedObject("appcast.xml", "<rss></rss>", "text/plain"),
      storedObject("PonyMux-0.1.0.dmg", encoder.encode("0123456789")),
      storedObject(
        "latest.json",
        JSON.stringify({ version: "0.1.0", dmg: "PonyMux-0.1.0.dmg" })
      ),
    ]),
    ASSETS: {
      fetch() {
        return new Response("asset fallback");
      },
    },
  };
}

test("serves appcast with feed headers", async () => {
  const response = await worker.fetch(
    new Request("https://ponymux.com/update/appcast.xml"),
    createEnv()
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/rss+xml; charset=utf-8");
  assert.equal(response.headers.get("Cache-Control"), "no-cache, max-age=0, must-revalidate");
  assert.equal(response.headers.get("ETag"), '"etag-appcast.xml"');
  assert.equal(await response.text(), "<rss></rss>");
});

test("uses metadata-only R2 lookup for HEAD", async () => {
  const env = createEnv();
  const response = await worker.fetch(
    new Request("https://ponymux.com/update/PonyMux-0.1.0.dmg", { method: "HEAD" }),
    env
  );

  assert.equal(response.status, 200);
  assert.equal(env.UPDATES.headCalls, 1);
  assert.equal(response.headers.get("Content-Length"), "10");
  assert.equal(await response.text(), "");
});

test("serves versioned DMGs as immutable downloads", async () => {
  const response = await worker.fetch(
    new Request("https://ponymux.com/update/PonyMux-0.1.0.dmg"),
    createEnv()
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/x-apple-diskimage");
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="PonyMux-0.1.0.dmg"');
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
});

test("supports single byte ranges", async () => {
  const response = await worker.fetch(
    new Request("https://ponymux.com/update/PonyMux-0.1.0.dmg", {
      headers: { Range: "bytes=2-5" },
    }),
    createEnv()
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 2-5/10");
  assert.equal(response.headers.get("Content-Length"), "4");
  assert.equal(await response.text(), "2345");
});

test("returns 304 when the client already has the current object", async () => {
  const response = await worker.fetch(
    new Request("https://ponymux.com/update/appcast.xml", {
      headers: { "If-None-Match": '"etag-appcast.xml"' },
    }),
    createEnv()
  );

  assert.equal(response.status, 304);
  assert.equal(response.headers.get("ETag"), '"etag-appcast.xml"');
  assert.equal(await response.text(), "");
});

test("ignores a stale If-Range validator and returns the full object", async () => {
  const response = await worker.fetch(
    new Request("https://ponymux.com/update/PonyMux-0.1.0.dmg", {
      headers: {
        Range: "bytes=2-5",
        "If-Range": '"stale-etag"',
      },
    }),
    createEnv()
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Range"), null);
  assert.equal(await response.text(), "0123456789");
});

test("ignores weak and non-matching date If-Range validators", async () => {
  for (const validator of [
    'W/"etag-PonyMux-0.1.0.dmg"',
    "Fri, 21 Aug 2026 00:00:01 GMT",
    "2026-08-21T00:00:00Z",
    "2026-08-21",
  ]) {
    const response = await worker.fetch(
      new Request("https://ponymux.com/update/PonyMux-0.1.0.dmg", {
        headers: {
          Range: "bytes=2-5",
          "If-Range": validator,
        },
      }),
      createEnv()
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Range"), null);
    assert.equal(await response.text(), "0123456789");
  }
});

test("honors matching strong and date If-Range validators", async () => {
  for (const validator of [
    '"etag-PonyMux-0.1.0.dmg"',
    "Fri, 21 Aug 2026 00:00:00 GMT",
    "Friday, 21-Aug-26 00:00:00 GMT",
    "Fri Aug 21 00:00:00 2026",
  ]) {
    const response = await worker.fetch(
      new Request("https://ponymux.com/update/PonyMux-0.1.0.dmg", {
        headers: {
          Range: "bytes=2-5",
          "If-Range": validator,
        },
      }),
      createEnv()
    );

    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Content-Range"), "bytes 2-5/10");
    assert.equal(await response.text(), "2345");
  }
});

test("rejects unsatisfiable and multipart ranges", async () => {
  for (const range of ["bytes=20-30", "bytes=0-1,4-5"]) {
    const response = await worker.fetch(
      new Request("https://ponymux.com/update/PonyMux-0.1.0.dmg", {
        headers: { Range: range },
      }),
      createEnv()
    );

    assert.equal(response.status, 416);
    assert.equal(response.headers.get("Content-Range"), "bytes */10");
  }
});

test("returns update route errors without falling back to the website", async () => {
  const missing = await worker.fetch(
    new Request("https://ponymux.com/update/missing.dmg"),
    createEnv()
  );
  const wrongMethod = await worker.fetch(
    new Request("https://ponymux.com/update/appcast.xml", { method: "POST" }),
    createEnv()
  );

  assert.equal(missing.status, 404);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("Allow"), "GET, HEAD");
});

test("redirects the stable download URL to the versioned DMG", async () => {
  const response = await worker.fetch(
    new Request("https://ponymux.com/download"),
    createEnv()
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://ponymux.com/update/PonyMux-0.1.0.dmg"
  );
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("keeps unrelated routes on the static asset binding", async () => {
  const response = await worker.fetch(new Request("https://ponymux.com/docs"), createEnv());
  assert.equal(await response.text(), "asset fallback");
});
