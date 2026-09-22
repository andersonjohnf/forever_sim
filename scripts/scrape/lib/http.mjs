// Cached, polite HTTP for the client-data scraper (scripts/scrape/client.mjs).
//
// Every response is cached under .cache/client/ (git-ignored) and is never
// downloaded again unless `refresh` is set. Requests are made one at a time,
// at least MIN_GAP_MS apart, with a descriptive User-Agent. Each network request
// is appended to .cache/client/requests.jsonl so the total request count across
// runs can be reported.
//
// Only two hosts are allowed:
//   * wago.tools, and only its documented API (https://wago.tools/apis):
//       /api/builds, /api/builds/latest, /api/builds/<product>/latest,
//       /api/files?version=…&format=json|csv, /api/info/<fdid>,
//       /api/casc/<fdid>?version=…
//     Its pages, /db2/… and the table CSV export are refused (docs/decisions.md D16).
//   * GitHub (raw.githubusercontent.com and api.github.com) for WoWDBDefs and wow-listfile.

import fs from "node:fs";
import path from "node:path";

export const USER_AGENT = "forever_sim-client-data/0.1 (+https://github.com/andersonjohnf/forever_sim)";
const MIN_GAP_MS = 1100;
const RETRY_DELAYS_MS = [5000, 15000, 45000];

const WAGO_ALLOWED = [
  /^\/api\/builds$/,
  /^\/api\/builds\/latest$/,
  /^\/api\/builds\/[a-z0-9_]+\/latest$/,
  /^\/api\/files$/,
  /^\/api\/info\/\d+$/,
  /^\/api\/casc\/\d+$/,
];

/** Throws unless `url` is one of the documented wago.tools API endpoints or a GitHub URL. */
export function assertAllowed(url) {
  const u = new URL(url);
  if (u.hostname === "wago.tools") {
    if (!WAGO_ALLOWED.some((re) => re.test(u.pathname))) {
      throw new Error(`Refusing to fetch ${url}: not a documented wago.tools API endpoint (D16)`);
    }
    return;
  }
  if (u.hostname === "raw.githubusercontent.com" || u.hostname === "api.github.com") return;
  throw new Error(`Refusing to fetch ${url}: host not allowed`);
}

export function createFetcher({ cacheDir, refresh = false, log = console.log }) {
  let lastRequestAt = 0;
  let requests = 0;
  let cacheHits = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * GET `url`, caching the body at `<cacheDir>/<cacheKey>`. Returns a Buffer.
   * `accept404` returns null (and caches the miss) instead of throwing.
   */
  async function get(url, cacheKey, { accept404 = false } = {}) {
    assertAllowed(url);
    const file = path.join(cacheDir, cacheKey);
    const metaFile = `${file}.meta.json`;
    if (!refresh && fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      if (meta.status === 404) {
        cacheHits++;
        if (accept404) return null;
        throw new Error(`GET ${url} -> HTTP 404 (cached)`);
      }
      if (fs.existsSync(file)) {
        cacheHits++;
        return fs.readFileSync(file);
      }
    }
    for (let attempt = 0; ; attempt++) {
      const wait = lastRequestAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      requests++;
      let res;
      let error;
      try {
        res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
      } catch (e) {
        error = e;
      }
      lastRequestAt = Date.now();
      const status = error ? 0 : res.status;
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.appendFileSync(
        path.join(cacheDir, "requests.jsonl"),
        `${JSON.stringify({ at: new Date().toISOString(), url, status })}\n`,
      );
      const retryable = error || status === 429 || status >= 500;
      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        log(`GET ${url} -> ${error ? error.message : `HTTP ${status}`}; retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s`);
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (error) throw new Error(`GET ${url} -> ${error.message}`);
      const body = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
      log(`GET ${url} -> ${status}${body ? ` (${body.length} bytes)` : ""}`);
      const meta = {
        url,
        status,
        fetchedAt: new Date().toISOString(),
        date: res.headers.get("date"),
        contentType: res.headers.get("content-type"),
        bytes: body?.length ?? 0,
      };
      if (status === 404) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
        if (accept404) return null;
        throw new Error(`GET ${url} -> HTTP 404`);
      }
      if (!res.ok) throw new Error(`GET ${url} -> HTTP ${status}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
      return body;
    }
  }

  /** Cache metadata written next to a cached response, or null. */
  function cachedMeta(cacheKey) {
    const metaFile = path.join(cacheDir, `${cacheKey}.meta.json`);
    return fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : null;
  }

  return {
    get,
    cachedMeta,
    stats: () => ({ requests, cacheHits }),
  };
}
