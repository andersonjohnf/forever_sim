// A generator's --check writes nothing to src/data or the cache, regenerates the build its
// committed dataset records, and can leave its fresh generation for the client scraper's check
// (docs/data/README.md#checking-the-committed-data).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkConflicts, checkNeeds, createOutput, inWords, recordedSource } from "./output.mjs";
import { CHECK_BUILDS, CLASSIC_BASELINE, DOC_TABLES_BUILD } from "./wago.mjs";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "output-test-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe("createOutput", () => {
  it("under check, compares without writing, keeps a fresh copy when asked, and fails on a stale file", () => {
    const repo = path.join(dir, "repo");
    const fresh = path.join(dir, "fresh");
    fs.mkdirSync(path.join(repo, "src/data"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src/data/a.json"), "same\n");
    fs.writeFileSync(path.join(repo, "src/data/b.json"), "old\n");
    const out = createOutput({ repoRoot: repo, check: true, fresh });
    out.write(path.join(repo, "src/data/a.json"), "same\n");
    out.write(path.join(repo, "src/data/b.json"), "new\n");
    out.write(path.join(repo, "src/data/c.json"), "added\n");
    out.finish();
    expect(out.stale).toEqual(["src/data/b.json", "src/data/c.json"]);
    expect(process.exitCode).toBe(1);
    expect(fs.readFileSync(path.join(repo, "src/data/b.json"), "utf8")).toBe("old\n");
    expect(fs.existsSync(path.join(repo, "src/data/c.json"))).toBe(false);
    expect(fs.readFileSync(path.join(fresh, "src/data/b.json"), "utf8")).toBe("new\n");
    expect(fs.readFileSync(path.join(fresh, "src/data/c.json"), "utf8")).toBe("added\n");
  });

  it("without check, writes the file", () => {
    const out = createOutput({ repoRoot: dir });
    out.write(path.join(dir, "src/data/x.json"), "x\n");
    out.finish();
    expect(fs.readFileSync(path.join(dir, "src/data/x.json"), "utf8")).toBe("x\n");
    expect(process.exitCode).toBeUndefined();
  });
});

describe("checkConflicts", () => {
  it("rejects --check with a flag that downloads or writes, --claims included (DR-2), and --fresh without --check", () => {
    expect(checkConflicts({ check: true, refresh: true, diff: true, fixtures: true, claims: "1.15.9.69722" })).toEqual([
      "--check can't be combined with --refresh",
      "--check can't be combined with --diff",
      "--check can't be combined with --fixtures",
      "--check can't be combined with --claims",
    ]);
    expect(checkConflicts({ check: true, claims: null, fresh: "/tmp/x" })).toEqual([]);
    expect(checkConflicts({ check: false, fresh: "/tmp/x" })).toEqual(["--fresh needs --check"]);
    expect(checkConflicts({ check: false, refresh: true, claims: "1.15.9.69722" })).toEqual([]);
  });
});

describe("recordedSource", () => {
  it("reads the build and WoWDBDefs commit a dataset records, under either meta key (DR-4)", () => {
    const write = (name, meta) => {
      fs.writeFileSync(path.join(dir, name), JSON.stringify({ meta }));
      return path.join(dir, name);
    };
    expect(recordedSource(write("spells.json", { foreverBuild: "1.60.1.69913", wowDbDefs: { commit: "abc" } }))).toEqual({ version: "1.60.1.69913", dbdefs: "abc" });
    expect(recordedSource(write("client.json", { build: "1.60.1.69913", wowDbDefs: { commit: "def" } }))).toEqual({ version: "1.60.1.69913", dbdefs: "def" });
    expect(recordedSource(write("bare.json", undefined))).toEqual({ version: null, dbdefs: null });
    expect(recordedSource(path.join(dir, "missing.json"))).toEqual({ version: null, dbdefs: null });
  });

  it("finds a build in every committed dataset the checks regenerate", () => {
    const repo = path.resolve(import.meta.dirname, "..", "..", "..");
    for (const f of ["src/data/spells/warrior.json", "src/data/talents/warrior.json", "src/data/races/races.json", "src/data/items/pre-bis.json", "src/data/client/spells.json"]) {
      const { version, dbdefs } = recordedSource(path.join(repo, f));
      expect(version, f).toMatch(/^1\.60\.\d+\.\d+$/);
      expect(dbdefs, f).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});

describe("checkNeeds", () => {
  const recorded = [
    { version: "1.60.1.69913", dbdefs: "a".repeat(40) },
    { version: "1.60.1.69913", dbdefs: "a".repeat(40) },
    { version: null, dbdefs: null },
  ];

  it("names the recorded build and commit, the Classic Era baseline and the build of the doc-cited tables, each once (LC-1)", () => {
    expect(checkNeeds({ recorded, cacheDir: "/c" })).toEqual([
      ["the Forever build 1.60.1.69913", path.join("/c", "1.60.1.69913")],
      [`the Classic Era baseline ${CLASSIC_BASELINE}`, path.join("/c", CLASSIC_BASELINE)],
      [`the Forever build ${DOC_TABLES_BUILD} (the tables the docs cite)`, path.join("/c", DOC_TABLES_BUILD)],
      ["the WoWDBDefs commit aaaaaaaaaaaa", path.join("/c", "github", "wowdbdefs", "a".repeat(40))],
    ]);
  });

  it("lets --version and --dbdefs replace what the data records, and names a directory once when a build is both", () => {
    const needs = checkNeeds({ recorded, version: DOC_TABLES_BUILD, dbdefs: "b".repeat(40), cacheDir: "/c" });
    expect(needs.map(([, dir]) => dir)).toEqual([path.join("/c", DOC_TABLES_BUILD), path.join("/c", CLASSIC_BASELINE), path.join("/c", "github", "wowdbdefs", "b".repeat(40))]);
    expect(needs[0][0]).toBe(`the Forever build ${DOC_TABLES_BUILD}`);
  });

  it("covers every build the client scraper's doc tables read", () => {
    const client = fs.readFileSync(path.join(import.meta.dirname, "..", "client.mjs"), "utf8");
    const start = client.indexOf("const DOC_TABLES = [");
    const names = [...client.slice(start, client.indexOf("];", start)).matchAll(/build: (\w+)/g)].map((m) => m[1]);
    expect(names).toEqual(["DOC_TABLES_BUILD", "DEFAULT_BASELINE"]);
    expect(client).toContain("const DEFAULT_BASELINE = CLASSIC_BASELINE;");
    expect(CHECK_BUILDS.map((c) => c.build)).toEqual([CLASSIC_BASELINE, DOC_TABLES_BUILD]);
  });
});

describe("inWords", () => {
  it("joins a list the way a sentence does", () => {
    expect(inWords([])).toBe("");
    expect(inWords(["a"])).toBe("a");
    expect(inWords(["a", "b"])).toBe("a and b");
    expect(inWords(["a", "b", "c"])).toBe("a, b and c");
  });
});
