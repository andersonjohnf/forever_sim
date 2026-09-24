// The committed datasets are exactly what the generators write (docs/data/README.md#checking-the-committed-data).
//
// The client scraper decides what to extract partly from the docs: the buffs doc's tables name
// the consumables and enchants, and a spell id a class or mechanics doc cites joins spells.json.
// So a doc edit can change the data, and a commit that edits a doc without regenerating leaves the
// committed data stale: T2's rewrite of the wizard oils' ID cells did, unnoticed, until a later
// regeneration dropped their enchants (docs/data/client.md#what-the-docs-decide).
//
// Two guards:
// - This test, in `npm test`, without the cache (CI included): what the current docs decide agrees
//   with src/data/client: the buffs doc's consumables, enchants and buff spells, and the doc
//   citations among the spells the data already carries (a citation of a spell it doesn't carry
//   yet needs the client's spell names, so only the second guard sees it).
// - `npm run scrape:check`, its own step of `npm run test:full` after the unit tests (it skips
//   when the cache lacks the committed build, as in CI): regenerates every dataset from the cached
//   client files, without a request, and compares it byte for byte. It isn't a test here: it runs
//   the generators for about 15 s and would compete with the unit tests' timing benchmarks.
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

  it("items.json's consumables and enchants.json record no disagreement between the buffs doc's chains and the client", () => {
    // The generator writes these and warns of each; an empty list is the only committed state that
    // means the doc's item → spell → enchant chains all hold (docs/data/client.md#what-the-docs-decide).
    const consumables = Object.fromEntries(Object.entries(items.consumables).filter(([, c]) => c.docMismatches.length > 0).map(([id, c]) => [id, c.docMismatches]));
    expect(consumables).toEqual({});
    expect(enchants.docMismatches).toEqual([]);
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
