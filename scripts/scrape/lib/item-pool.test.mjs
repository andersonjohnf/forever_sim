// Checks of the generated item pool (src/data/items/pre-bis.json) against the Forever client's
// spells (src/data/client/spells.json, which client.mjs extracts for every spell the pool reads):
// every aura on the pool's equip spells and set bonuses is classified, and fallback items read
// their spells from the Forever client (docs/data/items.md, docs/data/client.md#aura--stat).
import { describe, expect, it } from "vitest";
import spellsJson from "../../../src/data/client/spells.json";
import itemJson from "../../../src/data/items/pre-bis.json";
import { findTwins, twinKey } from "./item-pool.mjs";
import { AURA_STAT, NOT_STAT_AURAS } from "./item-stats.mjs";

const spells = spellsJson.spells;

describe("faction twins (docs/data/items.md#faction-twins)", () => {
  const row = (id, over = {}) => ({
    ID: id,
    Display_lang: `Item ${id}`,
    SellPrice: id,
    BuyPrice: id * 5,
    MinFactionID: 0,
    MinReputation: 0,
    AllowableRace: -1,
    AllowableClass: -1,
    ItemSet: 0,
    Flags: [0, 0, 0, 0],
    ItemLevel: 63,
    InventoryType: 17,
    StatModifier_bonusStat: [5, 7, -1],
    StatPercentEditor: [4000, 6000, 0],
    ...over,
  });
  const ctxOf = (rows, effects = {}) => ({
    sparse: new Map(rows.map((r) => [r.ID, r])),
    item: new Map(rows.map((r) => [r.ID, { ID: r.ID, ClassID: 2, SubclassID: 10 }])),
    itemEffects: new Map(Object.entries(effects).map(([id, list]) => [Number(id), list])),
  });
  const twinsIn = (rows, effects) => {
    const ctx = ctxOf(rows, effects);
    return findTwins(rows.map((r) => [r.ID, twinKey(ctx, "forever", r.ID), r]));
  };

  it("pairs rows that differ only in name, price, side and class binding, and the flags' faction bits", () => {
    const alliance = row(20069, { Display_lang: "Ironbark Staff", MinFactionID: 509, MinReputation: 7, Flags: [0, 2, 0, 0] });
    const horde = row(20220, { Display_lang: "Ironbark Staff", MinFactionID: 510, MinReputation: 7, Flags: [0, 1, 0, 0], AllowableClass: 256 });
    expect([...twinsIn([alliance, horde])]).toEqual([
      [20069, [20220]],
      [20220, [20069]],
    ]);
  });

  it("matches stats in any order, and a use by its cooldown, not its spell", () => {
    const a = row(12543, { StatModifier_bonusStat: [5, 7, -1], StatPercentEditor: [4000, 6000, 0] });
    const b = row(12545, { StatModifier_bonusStat: [7, 5, -1], StatPercentEditor: [6000, 4000, 0] });
    const use = (spell) => [{ SpellID: spell, TriggerType: 0, CoolDownMSec: 1000, CategoryCoolDownMSec: 0, Charges: 0 }];
    expect(twinsIn([a, b], { 12543: use(1), 12545: use(2) }).get(12543)).toEqual([12545]);
  });

  it("keeps apart rows whose stats, level or equip effects differ, and a same-name, same-side copy", () => {
    const a = row(1);
    expect(twinsIn([a, row(2, { ItemLevel: 65 })]).size).toBe(0);
    expect(twinsIn([a, row(2, { StatPercentEditor: [5000, 5000, 0] })]).size).toBe(0);
    const equip = (spell) => [{ SpellID: spell, TriggerType: 1, CoolDownMSec: 0, CategoryCoolDownMSec: 0, Charges: 0 }];
    expect(twinsIn([a, row(2)], { 1: equip(10), 2: equip(11) }).size).toBe(0);
    expect(twinsIn([a, row(2, { Display_lang: "Item 1" })]).size).toBe(0);
  });
});
const APPLY_AURA = 6;

/** Every spell the pool's stats, equip lines and set bonuses read: [spellId, where]. */
function equipSpells() {
  const out = [];
  for (const item of itemJson.items) {
    for (const id of item.statSpellIds) out.push([id, `item ${item.id} stats`]);
    for (const e of item.procs.concat(item.otherEquip)) if (e.raw.startsWith("Equip: ")) out.push([e.spellId, `item ${item.id} equip`]);
  }
  for (const [id, set] of Object.entries(itemJson.sets)) for (const b of set.bonuses) out.push([b.spellId, `set ${id} (${b.pieces})`]);
  return out;
}

describe("aura coverage (L8)", () => {
  const uses = equipSpells();

  it("finds the pool's equip and set-bonus spells in the Forever client's spells", () => {
    expect(uses.length).toBeGreaterThan(500);
    expect(uses.filter(([id]) => !spells[String(id)]).map(([id, where]) => `${id} (${where})`)).toEqual([]);
  });

  it("classifies every aura they carry: a stat (AURA_STAT) or listed as not one (NOT_STAT_AURAS)", () => {
    const unclassified = new Set();
    for (const [id, where] of uses)
      for (const e of spells[String(id)]?.effects ?? [])
        if (e.effect === APPLY_AURA && !((e.effectAura ?? 0) in AURA_STAT) && !((e.effectAura ?? 0) in NOT_STAT_AURAS)) unclassified.add(`aura ${e.effectAura ?? 0} on ${id} (${where})`);
    expect([...unclassified]).toEqual([]);
  });

  it("counts The Gladiator's 5-piece (aura 290) and Forever block value (aura 274) as stats", () => {
    const gladiator = itemJson.sets["1"].bonuses.find((b) => b.pieces === 5);
    expect(gladiator.parsed).toEqual({ crit: 1, spellCrit: 1 });
    const barrier = itemJson.items.find((i) => i.id === 18499);
    const aura274 = barrier.statSpellIds.flatMap((id) => spells[String(id)].effects).find((e) => e.effectAura === 274);
    expect(barrier.stats.blockValue).toBe(aura274.effectBasePointsF);
  });
});

describe("fallback items read their spells from the Forever client (L5)", () => {
  const fallback = itemJson.items.filter((i) => i.statsFrom === "classic");

  it("every stat and effect spell of a fallback item is a Forever client spell", () => {
    const ids = fallback.flatMap((i) => [...i.statSpellIds, ...[...i.procs, ...i.useEffects, ...i.otherEquip].map((e) => e.spellId)]);
    expect(ids.length).toBeGreaterThan(400);
    expect(ids.filter((id) => !spells[String(id)])).toEqual([]);
    expect(itemJson.meta.fallbackEffects.spellsFromForever).toBe(itemJson.meta.fallbackEffects.spells);
  });

  it("with Forever's values: Seal of the Dawn +78 AP against Undead (Classic Era 81), Hand of Justice +20 AP", () => {
    const seal = fallback.find((i) => i.id === 13209);
    const points = (id, aura) => spells[String(id)].effects.find((e) => e.effectAura === aura).effectBasePointsF;
    expect(seal.stats.attackPowerVsUndead).toBe(points(23930, 102));
    expect(seal.stats.attackPowerVsUndead).toBe(78);
    const hoj = fallback.find((i) => i.id === 11815);
    expect(hoj.stats.attackPower).toBe(points(9331, 99));
  });

  it("and Forever's item effects: Blackhand's Breadth gains a use (1318944), Mark of the Chosen's proc +21 all stats", () => {
    const breadth = fallback.find((i) => i.id === 13965);
    expect(breadth.useEffects.map((e) => [e.spellId, e.cooldownSec])).toEqual([[1318944, 300]]);
    expect(breadth.stats.crit).toBe(1);
    // Diamond Flask, whose use Forever made a 5 s heal ("CHUG!"), is off the pre-raid lists and so
    // out of the pool (docs/classes/warrior.md Q30).
    expect(itemJson.items.some((i) => i.id === 20130)).toBe(false);
    const mark = fallback.find((i) => i.id === 17774);
    expect(mark.procs.map((e) => e.spellId)).toEqual([21969]);
    expect(mark.procs[0].raw).toContain("all stats by 21");
    expect(spells["21969"].auraOptions.procCategoryRecovery).toBe(120000);
  });
});
