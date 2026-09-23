// The generators write the same bytes on every machine (docs/data/README.md#rules): their text
// order doesn't follow the locale (L35), and the committed-dataset reader fails with a reason
// (L36).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCommitted } from "./committed.mjs";
import { compareText, stableStringify } from "./json.mjs";

const SCRAPE_DIR = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(SCRAPE_DIR, "..", "..");
const WORDS = ["Zebra", "Äpple", "apple", "Apple", "ıslak", "Istanbul", "istanbul", "Nature's Grasp", "Natures", "Mangle (Bear)", "mangle", "Z"];

/** WORDS sorted by compareText in a fresh Node process under a locale. */
function sortUnder(locale) {
  const script = `import("${path.join(import.meta.dirname, "json.mjs")}").then(({ compareText }) => console.log(JSON.stringify(${JSON.stringify(WORDS)}.sort(compareText))))`;
  const env = { ...process.env, LANG: locale, LC_ALL: locale, LC_COLLATE: locale };
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { env }).toString("utf8"));
}

describe("compareText", () => {
  it("orders case-insensitively, then by code unit", () => {
    expect(["b", "B", "a", "A", "aa"].sort(compareText)).toEqual(["A", "a", "aa", "B", "b"]);
    expect(compareText("Zebra", "Äpple")).toBeLessThan(0); // code units: "ä" (U+00E4) after "z"
  });

  it("sorts the same under any locale (a Swedish, a Turkish and the C locale)", () => {
    const here = [...WORDS].sort(compareText);
    for (const locale of ["C", "sv_SE.UTF-8", "tr_TR.UTF-8"]) expect(sortUnder(locale), locale).toEqual(here);
  });

  it("where localeCompare would not: Swedish puts Ä after Z, English next to A", () => {
    expect("Äpple".localeCompare("Zebra", "sv")).toBeGreaterThan(0);
    expect("Äpple".localeCompare("Zebra", "en")).toBeLessThan(0);
  });

  it("is the only text order the generators use: no localeCompare, Collator or toLocale* in scripts/scrape", () => {
    const files = fs.readdirSync(SCRAPE_DIR, { recursive: true }).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"));
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((f) => /\.localeCompare\(|Intl\.Collator\(|\.toLocale(?:Lower|Upper)Case\(|\.toLocaleString\(/.test(fs.readFileSync(path.join(SCRAPE_DIR, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("stableStringify", () => {
  it("sorts keys by code point (integer keys first) whatever the locale", () => {
    expect(stableStringify({ b: 1, a: 1, B: 1, 10: 1, 2: 1 })).toBe('{\n  "2": 1,\n  "10": 1,\n  "B": 1,\n  "a": 1,\n  "b": 1\n}\n');
  });
});

describe("readCommitted (the storage guards fail closed)", () => {
  it("reads a committed dataset", () => {
    const { data, error } = readCommitted(REPO_ROOT, "src/data/races/races.json", "HEAD");
    expect(error).toBeNull();
    expect(data.races.length).toBeGreaterThan(0);
  });

  it("says why when git can't show it", () => {
    const { data, error } = readCommitted(REPO_ROOT, "src/data/races/races.json", "no-such-ref-f2");
    expect(data).toBeNull();
    expect(error).toMatch(/^git show no-such-ref-f2:src\/data\/races\/races\.json failed: /);
    expect(readCommitted(REPO_ROOT, "src/data/no-such-file.json").error).toMatch(/failed/);
  });
});
