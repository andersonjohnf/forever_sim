// The fetch layer's rules (docs/data/client.md#requests): only https, the allowed hosts and
// wago.tools' documented API, on every redirect hop too, and cache keys inside the cache.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RefusedError, assertAllowed, cachePath, createFetcher, fetchAllowed } from "./http.mjs";
import { assertBuildVersion, assertCommitSha, dbdefsProblems } from "./wago.mjs";

/** A fetch that answers from a table of URL → [status, location?], recording what it was asked. */
function fakeFetch(routes) {
  const asked = [];
  const impl = async (url, init) => {
    asked.push(url);
    expect(init.redirect).toBe("manual");
    const [status, location] = routes[url] ?? [404];
    return new Response(status >= 300 && status < 400 ? null : "ok", { status, headers: location ? { location } : {} });
  };
  return { impl, asked };
}

describe("assertAllowed", () => {
  it("allows the documented wago.tools API and GitHub", () => {
    for (const url of [
      "https://wago.tools/api/builds/wow_classic_beta/latest",
      "https://wago.tools/api/casc/1002166?version=1.60.1.69913",
      "https://raw.githubusercontent.com/wowdev/WoWDBDefs/2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e/manifest.json",
      "https://api.github.com/repos/wowdev/WoWDBDefs/commits/master",
    ]) expect(() => assertAllowed(url)).not.toThrow();
  });

  it("refuses wago.tools pages, other hosts and plain http", () => {
    for (const url of ["https://wago.tools/db2/Spell", "https://example.com/api/casc/1", "http://wago.tools/api/builds", "https://wago.tools.example.com/api/builds"]) {
      expect(() => assertAllowed(url)).toThrow(RefusedError);
    }
  });
});

describe("fetchAllowed", () => {
  it("follows a redirect to an allowed URL", async () => {
    const { impl, asked } = fakeFetch({
      "https://api.github.com/repos/wowdev/WoWDBDefs/commits/master": [301, "/repositories/1/commits/master"],
      "https://api.github.com/repositories/1/commits/master": [200],
    });
    const res = await fetchAllowed("https://api.github.com/repos/wowdev/WoWDBDefs/commits/master", {}, impl);
    expect(res.status).toBe(200);
    expect(asked).toEqual(["https://api.github.com/repos/wowdev/WoWDBDefs/commits/master", "https://api.github.com/repositories/1/commits/master"]);
  });

  it("refuses a hop to another host or to a wago.tools page, before requesting it", async () => {
    for (const location of ["https://evil.example/x", "https://wago.tools/db2/Spell?format=csv", "http://wago.tools/api/builds"]) {
      const { impl, asked } = fakeFetch({ "https://wago.tools/api/builds": [302, location] });
      await expect(fetchAllowed("https://wago.tools/api/builds", {}, impl)).rejects.toThrow(RefusedError);
      expect(asked).toEqual(["https://wago.tools/api/builds"]);
    }
  });

  it("stops after five redirects", async () => {
    const { impl, asked } = fakeFetch({ "https://wago.tools/api/builds": [302, "https://wago.tools/api/builds"] });
    await expect(fetchAllowed("https://wago.tools/api/builds", {}, impl)).rejects.toThrow(/more than 5 redirects/);
    expect(asked).toHaveLength(6);
  });
});

describe("createFetcher", () => {
  const dirs = [];
  afterEach(() => {
    vi.useRealTimers();
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A fetcher over a fresh cache directory and `fakeFetch(routes)`, recording when each request went out. */
  function fetcher(routes) {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "forever-sim-http-"));
    dirs.push(cacheDir);
    const { impl, asked } = fakeFetch(routes);
    const at = [];
    const timed = (url, init) => {
      at.push(Date.now());
      return impl(url, init);
    };
    const logged = () =>
      fs
        .readFileSync(path.join(cacheDir, "requests.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .map(({ url, status }) => `${status} ${url}`);
    return { get: createFetcher({ cacheDir, log: () => {}, fetchImpl: timed }).get, asked, at, logged };
  }

  it("spaces and logs every redirect hop as its own request", async () => {
    vi.useFakeTimers();
    const f = fetcher({
      "https://api.github.com/repos/a/b": [301, "/repositories/1"],
      "https://api.github.com/repositories/1": [302, "https://raw.githubusercontent.com/a/b/c"],
      "https://raw.githubusercontent.com/a/b/c": [200],
    });
    const body = f.get("https://api.github.com/repos/a/b", "x/b.json");
    await vi.runAllTimersAsync();
    expect((await body).toString()).toBe("ok");
    expect(f.asked).toHaveLength(3);
    for (let i = 1; i < f.at.length; i++) expect(f.at[i] - f.at[i - 1]).toBeGreaterThanOrEqual(1100);
    expect(f.logged()).toEqual(["301 https://api.github.com/repos/a/b", "302 https://api.github.com/repositories/1", "200 https://raw.githubusercontent.com/a/b/c"]);
  });

  describe("offline (a generator's --check)", () => {
    /** An offline fetcher over a fresh cache holding `seed` ({ key: [meta, body?] }), with a spy that redirects every request. */
    function offlineFetcher(seed = {}) {
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "forever-sim-http-offline-"));
      dirs.push(cacheDir);
      for (const [key, [meta, body]] of Object.entries(seed)) {
        const file = path.join(cacheDir, key);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(`${file}.meta.json`, JSON.stringify(meta));
        if (body !== undefined) fs.writeFileSync(file, body);
      }
      const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://wago.tools/api/builds" } }));
      const log = vi.fn();
      const f = createFetcher({ cacheDir, offline: true, log, fetchImpl });
      return { f, fetchImpl, log, requestLog: path.join(cacheDir, "requests.jsonl") };
    }
    const url = "https://wago.tools/api/builds";

    it("throws on a miss, with accept404 too, and on a meta without its body, without a request", async () => {
      const { f, fetchImpl, log, requestLog } = offlineFetcher({ "no-body.json": [{ url, status: 200 }] });
      await expect(f.get(url, "missing.json")).rejects.toThrow(/isn't in the cache.*offline run makes no requests/);
      await expect(f.get(url, "missing.json", { accept404: true })).rejects.toThrow(/isn't in the cache/);
      await expect(f.get(url, "no-body.json")).rejects.toThrow(/isn't in the cache/);
      expect(fetchImpl).not.toHaveBeenCalled();
      // No hook ran: nothing counted as a request, logged or written to requests.jsonl.
      expect(f.stats().requests).toBe(0);
      expect(log).not.toHaveBeenCalled();
      expect(fs.existsSync(requestLog)).toBe(false);
    });

    it("serves cached hits and cached 404s, without a request", async () => {
      const { f, fetchImpl, requestLog } = offlineFetcher({
        "hit.json": [{ url, status: 200 }, "cached body"],
        "gone.json": [{ url, status: 404 }],
      });
      expect((await f.get(url, "hit.json")).toString()).toBe("cached body");
      expect(await f.get(url, "gone.json", { accept404: true })).toBeNull();
      await expect(f.get(url, "gone.json")).rejects.toThrow(/HTTP 404 \(cached\)/);
      expect(f.stats()).toEqual({ requests: 0, cacheHits: 3 });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(fs.existsSync(requestLog)).toBe(false);
    });

    it("refuses offline with refresh", () => {
      expect(() => createFetcher({ cacheDir: os.tmpdir(), offline: true, refresh: true, fetchImpl: vi.fn() })).toThrow(/offline fetcher can't refresh/);
    });
  });

  it("logs the request already made when the next hop is refused", async () => {
    const f = fetcher({ "https://wago.tools/api/builds": [302, "https://evil.example/x"] });
    await expect(f.get("https://wago.tools/api/builds", "builds.json")).rejects.toThrow(RefusedError);
    expect(f.logged()).toEqual(["302 https://wago.tools/api/builds"]);
  });
});

describe("cachePath", () => {
  it("keeps cache keys inside the cache directory", () => {
    expect(cachePath("/c", "1.60.1.69913/casc/1.bin")).toBe(path.resolve("/c/1.60.1.69913/casc/1.bin"));
    for (const key of ["../x", "a/../../x", "/etc/passwd", ".."]) expect(() => cachePath("/c", key)).toThrow(RefusedError);
  });
});

describe("build versions and commits", () => {
  it("accepts wago.tools' build versions and full SHAs only", () => {
    for (const v of ["1.60.1.69913", "1.15.9.69722"]) expect(assertBuildVersion(v)).toBe(v);
    for (const v of ["../..", "1.60.1", "1.60.1.69913/../x", "1.60&x=1", " 1.60.1.69913", undefined, 1601]) expect(() => assertBuildVersion(v)).toThrow(/build version/);
    expect(assertCommitSha("2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e")).toBe("2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e");
    for (const sha of ["2f0893f", "../master", "2F0893F8B18B45A9CBE7CBBFB0DA73C00DA6651E"]) expect(() => assertCommitSha(sha)).toThrow(/SHA/);
  });

  it("makes a --dbdefs that isn't a full SHA a usage error, before the generator runs", () => {
    expect(dbdefsProblems({ dbdefs: null })).toEqual([]);
    expect(dbdefsProblems({ dbdefs: "2f0893f8b18b45a9cbe7cbbfb0da73c00da6651e" })).toEqual([]);
    expect(dbdefsProblems({ dbdefs: "deadbeef" })).toEqual(["--dbdefs=deadbeef isn't a WoWDBDefs commit SHA (40 lowercase hex digits)"]);
  });
});
