// The buffs doc's tables decide which consumables and enchants the client scraper extracts
// (docs/data/client.md#what-the-docs-decide), so every ID-cell shape the doc uses has a case here,
// and a shape the parser can't read is reported rather than dropped.
import { describe, expect, it } from "vitest";
import { droppedDocCitations, droppedDocCitationWarning, parseBuffsDoc } from "./docrefs.mjs";

/** A §3 table with one row per ID cell. */
const consumablesDoc = (...rows) =>
  [
    "## 3. Consumables",
    "### 3.6 Weapon enhancements (temporary)",
    "",
    "| Item | ID | Effect |",
    "| --- | --- | --- |",
    ...rows.map(([name, cell]) => `| ${name} | ${cell} | x |`),
    "",
  ].join("\n");

/** The parsed consumables, each checked for the table's section and returned without it. */
const consumables = (...rows) =>
  parseBuffsDoc(consumablesDoc(...rows)).consumables.map(({ section, ...c }) => {
    expect(section).toBe("3.6 Weapon enhancements (temporary)");
    return c;
  });

describe("parseBuffsDoc §3 ID cells", () => {
  it("reads an item and its buff spell, and pairs item and spell lists index-wise", () => {
    expect(consumables(["Flask of the Titans", "13510 → 17626"], ["Demonic Rune / Dark Rune", "12662 / 20520 → 16666 / 27869"])).toEqual([
      { itemId: 13510, name: "Flask of the Titans", spellIds: [17626], triggeredSpellIds: [], enchantIds: [], enchantSpellIds: [] },
      { itemId: 12662, name: "Demonic Rune / Dark Rune", spellIds: [16666], triggeredSpellIds: [], enchantIds: [], enchantSpellIds: [] },
      { itemId: 20520, name: "Demonic Rune / Dark Rune", spellIds: [27869], triggeredSpellIds: [], enchantIds: [], enchantSpellIds: [] },
    ]);
  });

  it("reads an item straight to its enchant", () => {
    expect(consumables(["Elemental Sharpening Stone", "18262 → enchant 2506"])).toEqual([
      { itemId: 18262, name: "Elemental Sharpening Stone", spellIds: [], triggeredSpellIds: [], enchantIds: [2506], enchantSpellIds: [] },
    ]);
  });

  it("reads the whole chain item → spell → enchant → the enchant's spell (the wizard oils, T2)", () => {
    expect(consumables(["Wizard Oil (`wizardOil`)", "20750 → 25121 → enchant 2627 → 25111"])).toEqual([
      { itemId: 20750, name: "Wizard Oil", spellIds: [25121], triggeredSpellIds: [], enchantIds: [2627], enchantSpellIds: [25111] },
    ]);
  });

  it("keeps the item's own spell when a triggered spell follows it (Blessed Sunfruit)", () => {
    expect(consumables(["Blessed Sunfruit", "13810 → 18124 → 18125"])).toEqual([
      { itemId: 13810, name: "Blessed Sunfruit", spellIds: [18124], triggeredSpellIds: [18125], enchantIds: [], enchantSpellIds: [] },
    ]);
  });

  it("reads a named spell step and leaves the catalogue key out of the name (Nightfin Soup)", () => {
    expect(consumables(["Nightfin Soup (`nightfinSoup`)", "13931 → Nutritious Food 1249513"])).toEqual([
      { itemId: 13931, name: "Nightfin Soup", spellIds: [1249513], triggeredSpellIds: [], enchantIds: [], enchantSpellIds: [] },
    ]);
  });

  it("reads an item alone, and skips an empty cell", () => {
    expect(consumables(["Mightfish Steak", "13934"], ["*Herbal Salad*", "—"])).toEqual([
      { itemId: 13934, name: "Mightfish Steak", spellIds: [], triggeredSpellIds: [], enchantIds: [], enchantSpellIds: [] },
    ]);
  });

  it("reports a cell it can't read instead of dropping its ids", () => {
    const { consumables: found, problems } = parseBuffsDoc(
      consumablesDoc(["No item", "→ 17626"], ["Empty step", "20750 → → enchant 2627"], ["Two enchants", "20750 → enchant 2627 → enchant 2628"], ["Buried enchant", "20750 → 25121 via enchant 2627"]),
    );
    expect(found).toEqual([]);
    expect(problems).toEqual([
      '3.6 Weapon enhancements (temporary), No item: no item id in "→ 17626"',
      '3.6 Weapon enhancements (temporary), Empty step: a step with no id in "20750 → → enchant 2627"',
      '3.6 Weapon enhancements (temporary), Two enchants: more than one enchant in "20750 → enchant 2627 → enchant 2628"',
      '3.6 Weapon enhancements (temporary), Buried enchant: an enchant step that isn\'t "enchant N" in "20750 → 25121 via enchant 2627"',
    ]);
  });

  it('reads "Enchant" in any case (DR-1: the capitalised step used to drop 2627 and 25111 without a word)', () => {
    expect(consumables(["Wizard Oil", "20750 → 25121 → Enchant 2627 → 25111"])).toEqual([
      { itemId: 20750, name: "Wizard Oil", spellIds: [25121], triggeredSpellIds: [], enchantIds: [2627], enchantSpellIds: [25111] },
    ]);
    expect(parseBuffsDoc(consumablesDoc(["Enchantment", "20750 → Enchantment 2627"])).problems).toEqual([
      '3.6 Weapon enhancements (temporary), Enchantment: an enchant step that isn\'t "enchant N" in "20750 → Enchantment 2627"',
    ]);
  });

  it("returns the spell steps between the item's spell and the enchant as triggered, for the scraper to check (DR-1)", () => {
    // The client scraper reports 25113 here: it's the enchant's spell, not one 25122 triggers.
    expect(consumables(["Brilliant Wizard Oil", "20749 → 25122 → 25113 → enchant 2628"])).toEqual([
      { itemId: 20749, name: "Brilliant Wizard Oil", spellIds: [25122], triggeredSpellIds: [25113], enchantIds: [2628], enchantSpellIds: [] },
    ]);
  });

  it("pairs triggered spells with the items index-wise, like the item's spell", () => {
    expect(consumables(["A / B", "1 / 2 → 10 / 20 → 100 / 200"], ["C / D", "3 / 4 → 30 → 300"])).toEqual([
      { itemId: 1, name: "A / B", spellIds: [10], triggeredSpellIds: [100], enchantIds: [], enchantSpellIds: [] },
      { itemId: 2, name: "A / B", spellIds: [20], triggeredSpellIds: [200], enchantIds: [], enchantSpellIds: [] },
      { itemId: 3, name: "C / D", spellIds: [30], triggeredSpellIds: [300], enchantIds: [], enchantSpellIds: [] },
      { itemId: 4, name: "C / D", spellIds: [30], triggeredSpellIds: [300], enchantIds: [], enchantSpellIds: [] },
    ]);
  });

  it("reports a cell whose ids don't line up with its items (DR-9)", () => {
    const { consumables: found, problems } = parseBuffsDoc(
      consumablesDoc(["ASCII arrow", "20750 -> 25121"], ["Count", "13931 (x2) → 1249513"], ["Three to two", "1 / 2 / 3 → 10 / 20"], ["Digits in a name", "13931 → Food Rank 2 1249513"]),
    );
    expect(found).toEqual([]);
    expect(problems).toEqual([
      '3.6 Weapon enhancements (temporary), ASCII arrow: an ASCII arrow "->" (steps are separated by "→") in "20750 -> 25121"',
      '3.6 Weapon enhancements (temporary), Count: an items step that isn\'t a list of ids in "13931 (x2) → 1249513"',
      '3.6 Weapon enhancements (temporary), Three to two: 3 item(s) but a step with a different number of spells in "1 / 2 / 3 → 10 / 20"',
      '3.6 Weapon enhancements (temporary), Digits in a name: a spell step that isn\'t a list of ids in "13931 → Food Rank 2 1249513"',
    ]);
  });
});

describe("parseBuffsDoc tables", () => {
  const table = (heading, header) => [heading, "### x.1 Some table", "", header, "| --- | --- | --- |", "| Wizard Oil | 20750 → 25121 | x |", ""].join("\n");

  it("reports a §1, §3, §4 or §5 table with no ID column instead of skipping its rows (DR-9)", () => {
    for (const heading of ["## 1. Raid and party buffs", "## 3. Consumables", "## 4. Target debuffs", "## 5. Enchants and item enhancements"]) {
      const parsed = parseBuffsDoc(table(heading, "| Item | Item ID | Effect |"));
      expect(parsed.problems).toEqual(["x.1 Some table: a table with no ID column (Item | Item ID | Effect); its rows are skipped"]);
      expect([...parsed.buffSpells, ...parsed.consumables, ...parsed.enchants]).toEqual([]);
    }
  });

  it("reads a §4 item → proc cell as the weapon's consumable record, and reports one of another shape", () => {
    const doc = ["## 4. Target debuffs", "### 4.1 Armor reduction", "", "| Name | ID | Effect |", "| --- | --- | --- |", "| Sunder Armor | 11597 | x |", "| Annihilator | item 12798 → 16928 | x |", "| Rivenspike | Item 13286 → 17315 | x |", "| Nightfall | item 19169 -> 23605 | x |", ""];
    const parsed = parseBuffsDoc(doc.join("\n"));
    expect(parsed.buffSpells.map((b) => b.spellId)).toEqual([11597]);
    expect(parsed.consumables.map((c) => [c.itemId, c.spellIds])).toEqual([
      [12798, [16928]],
      [13286, [17315]],
    ]);
    expect(parsed.problems).toEqual(['4.1 Armor reduction, Nightfall: not "item N → S" or a list of spell ids in "item 19169 -> 23605"']);
  });

  it("skips the tables with no ids by design (§1.3's camp buffs) and §2's world buffs", () => {
    expect(parseBuffsDoc(table("## 1. Raid and party buffs", "| Camp object (profession) | Buff at level 60 | Tag |")).problems).toEqual([]);
    expect(parseBuffsDoc(table("## 2. World buffs", "| Name | Spell | Effect |")).problems).toEqual([]);
  });
});

// A spell the docs cited at the previous build must not leave the data without a word: the
// druid review's DR2-3, when Mangle's rename to Primal Bite stopped its ids matching by name.
describe("droppedDocCitations", () => {
  const previous = {
    spells: {
      407995: { name: "Mangle", sources: ["docs"] },
      1238073: { name: "Mangle", sources: ["docs", "spellbook"] },
      12966: { name: "Flurry", sources: ["docs"] },
      9881: { name: "Maul", sources: ["spellbook"] },
      555: { name: "Gone", sources: ["docs", "trigger"] },
    },
  };
  const names = { 407995: "Primal Bite", 1238073: "Primal Bite", 12966: "Flurry", 9881: "Maul" };
  const spellName = (id) => names[id] ?? null;

  it("lists only the docs' ids the new generation drops, with the new build's name", () => {
    // 1238073 stays through the spellbook, and 9881 was never the docs', so neither is listed.
    expect(droppedDocCitations(previous, new Set([1238073, 9881]), spellName)).toEqual([
      { id: 555, name: "Gone", nameNow: null },
      { id: 12966, name: "Flurry", nameNow: "Flurry" },
      { id: 407995, name: "Mangle", nameNow: "Primal Bite" },
    ]);
  });

  it("says why: a rename, an id gone from the client, or a citation the docs dropped", () => {
    const [gone, uncited, renamed] = droppedDocCitations(previous, new Set([1238073]), spellName);
    expect(droppedDocCitationWarning(renamed, "1.60.1.69913")).toBe(
      'spell 407995 (Mangle) was cited by the docs at 1.60.1.69913 and is no longer in spells.json: the client now calls it "Primal Bite", so cite it by that name or with a marker ("spell 407995")',
    );
    expect(droppedDocCitationWarning(gone, "1.60.1.69913")).toMatch(/^spell 555 \(Gone\) .*: it isn't in this build's client$/);
    expect(droppedDocCitationWarning(uncited, undefined)).toBe(
      "spell 12966 (Flurry) was cited by the docs at the previous build and is no longer in spells.json: no doc cites it by name or marker any more",
    );
  });

  it("lists nothing without previous data, or when every cited id is kept", () => {
    expect(droppedDocCitations(null, new Set(), spellName)).toEqual([]);
    expect(droppedDocCitations(previous, new Set([407995, 1238073, 12966, 555]), spellName)).toEqual([]);
  });
});
