// The committed datasets are exactly what the generators write (docs/data/README.md#checking-the-committed-data).
//
// The client scraper decides what to extract partly from the docs: the buffs doc's tables name
// the consumables and enchants, and a spell id a class or mechanics doc cites joins spells.json.
// So a doc edit can change the data, and a commit that edits a doc without regenerating leaves the
// committed data stale: T2's rewrite of the wizard oils' ID cells did, unnoticed, until a later
// regeneration dropped their enchants (docs/data/client.md#what-the-docs-decide).
//
// Two guards:
// - Without the cache (CI): what the current docs decide agrees with src/data/client: the buffs
//   doc's consumables, enchants and buff spells, and the doc citations among the spells the
//   data already carries (a citation of a spell it doesn't carry yet needs the client's spell
//   names, so only the second guard sees it).
// - With the raw client files cached (.cache/client, from `npm run scrape`): `npm run scrape:check`
//   regenerates every dataset from the cache, without a request, and compares it byte for byte.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BUFFS_DOC, citingDocs, docSpellMentions, parseBuffsDoc } from "./lib/docrefs.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));
const sorted = (ids) => [...new Set(ids)].map(Number).sort((a, b) => a - b);

const spells = readJson("src/data/client/spells.json");
const items = readJson("src/data/client/items.json");
const enchants = readJson("src/data/client/enchants.json");
const buffsDoc = parseBuffsDoc(read(BUFFS_DOC));
const withSource = (source) => sorted(Object.values(spells.spells).filter((s) => s.sources.includes(source)).map((s) => s.id));

describe("src/data/client agrees with what the docs decide (no cache needed)", () => {
  it(`every ID cell of ${BUFFS_DOC} parses`, () => {
    expect(buffsDoc.problems).toEqual([]);
  });

  it("items.json carries the buffs doc's consumables, with the doc's names and ids", () => {
    const fromDoc = Object.fromEntries(buffsDoc.consumables.map((c) => [c.itemId, { name: c.name, section: c.section, spellIds: c.spellIds, enchantIds: c.enchantIds }]));
    const committed = Object.fromEntries(Object.entries(items.consumables).map(([id, c]) => [id, c.doc]));
    expect(committed).toEqual(fromDoc);
  });

  it("enchants.json carries every enchant the buffs doc names (its §5 and the consumables' enchants)", () => {
    const fromDoc = sorted([...buffsDoc.enchants.flatMap((e) => e.enchantIds), ...buffsDoc.consumables.flatMap((c) => c.enchantIds)]);
    expect(sorted([...Object.keys(enchants.enchants), ...enchants.notInClient])).toEqual(fromDoc);
  });

  it("spells.json's buffsDoc spells are the buffs doc's §1 and §4 spells", () => {
    const notExtracted = new Set([...Object.keys(spells.excludedWorldBuffs), ...spells.notInClient.map((m) => m.id)].map(Number));
    expect(withSource("buffsDoc")).toEqual(sorted(buffsDoc.buffSpells.map((b) => b.spellId).filter((id) => !notExtracted.has(id))));
  });

  it("spells.json's docs spells are the ones the class, mechanics and open-questions docs cite, among the spells it carries", () => {
    const name = (id) => spells.spells[id]?.name ?? null;
    const cited = citingDocs(REPO_ROOT).flatMap((f) => [...docSpellMentions(read(f), name).keys()]);
    expect(withSource("docs")).toEqual(sorted(cited));
  });
});

const latest = path.join(REPO_ROOT, ".cache/client/builds/wow_classic_beta_latest.json");
const cached = fs.existsSync(latest);

describe("every dataset in src/data is a fresh generation from the cached client files", () => {
  it.skipIf(!cached)("npm run scrape:check passes (no requests; skipped without .cache/client)", () => {
    const run = spawnSync(process.execPath, [path.join(import.meta.dirname, "all.mjs"), "--check"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
    const report = `${run.stdout}\n${run.stderr}`.split("\n").filter((l) => /^check:|--check|error|ERROR|isn't in the cache/.test(l));
    expect(run.status, report.join("\n")).toBe(0);
  }, 300_000);
});
