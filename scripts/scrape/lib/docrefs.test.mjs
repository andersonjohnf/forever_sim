// The buffs doc's tables decide which consumables and enchants the client scraper extracts
// (docs/data/client.md#what-the-docs-decide), so every ID-cell shape the doc uses has a case here,
// and a shape the parser can't read is reported rather than dropped.
import { describe, expect, it } from "vitest";
import { parseBuffsDoc } from "./docrefs.mjs";

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
      { itemId: 13510, name: "Flask of the Titans", spellIds: [17626], enchantIds: [], enchantSpellIds: [] },
      { itemId: 12662, name: "Demonic Rune / Dark Rune", spellIds: [16666], enchantIds: [], enchantSpellIds: [] },
      { itemId: 20520, name: "Demonic Rune / Dark Rune", spellIds: [27869], enchantIds: [], enchantSpellIds: [] },
    ]);
  });

  it("reads an item straight to its enchant", () => {
    expect(consumables(["Elemental Sharpening Stone", "18262 → enchant 2506"])).toEqual([
      { itemId: 18262, name: "Elemental Sharpening Stone", spellIds: [], enchantIds: [2506], enchantSpellIds: [] },
    ]);
  });

  it("reads the whole chain item → spell → enchant → the enchant's spell (the wizard oils, T2)", () => {
    expect(consumables(["Wizard Oil (`wizardOil`)", "20750 → 25121 → enchant 2627 → 25111"])).toEqual([
      { itemId: 20750, name: "Wizard Oil", spellIds: [25121], enchantIds: [2627], enchantSpellIds: [25111] },
    ]);
  });

  it("keeps the item's own spell when a triggered spell follows it (Blessed Sunfruit)", () => {
    expect(consumables(["Blessed Sunfruit", "13810 → 18124 → 18125"])).toEqual([
      { itemId: 13810, name: "Blessed Sunfruit", spellIds: [18124], enchantIds: [], enchantSpellIds: [] },
    ]);
  });

  it("reads a named spell step and leaves the catalogue key out of the name (Nightfin Soup)", () => {
    expect(consumables(["Nightfin Soup (`nightfinSoup`)", "13931 → Nutritious Food 1249513"])).toEqual([
      { itemId: 13931, name: "Nightfin Soup", spellIds: [1249513], enchantIds: [], enchantSpellIds: [] },
    ]);
  });

  it("reads an item alone, and skips an empty cell", () => {
    expect(consumables(["Mightfish Steak", "13934"], ["*Herbal Salad*", "—"])).toEqual([
      { itemId: 13934, name: "Mightfish Steak", spellIds: [], enchantIds: [], enchantSpellIds: [] },
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
      "3.6 Weapon enhancements (temporary), Buried enchant: an enchant that doesn't start its step in \"20750 → 25121 via enchant 2627\"",
    ]);
  });
});
