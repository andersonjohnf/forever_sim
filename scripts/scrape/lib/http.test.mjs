// The fetch layer's rules (docs/data/client.md#requests): only https, the allowed hosts and
// wago.tools' documented API, on every redirect hop too, and cache keys inside the cache.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RefusedError, assertAllowed, cachePath, fetchAllowed } from "./http.mjs";
import { assertBuildVersion, assertCommitSha } from "./wago.mjs";

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
});
