// Unit tests for the spellbook derivation (scripts/scrape/lib/spellbook.mjs) and the race helpers
// (race-data.mjs). The rows are shaped like the client's; ids and values are the real ones of
// the named spells, trimmed to the columns the code reads.
import { describe, expect, it } from "vitest";
import { classesOfMask, groupByText, raceNames, racialId } from "./race-data.mjs";
import { createSpellTextContext } from "./spell-text.mjs";
import {
  costOf,
  createBookContext,
  formatCooldownSeconds,
  learnableBy,
  maskHasRace,
  pairRows,
  rangeOf,
  rankDifferences,
  rankNumber,
  readBook,
  textChange,
} from "./spellbook.mjs";

const byId = (rows) => ({ rows, byId: new Map(rows.map((r) => [r.ID, r])) });
const row = (spellId, rank, level, extra = {}) => ({ spellId, rank, level, raceMasks: [[0, 0]], fromTalent: false, ...extra });

describe("rank fields", () => {
  const ctx = {
    power: new Map([
      [2687, { PowerType: -2, PowerCostPct: 20, ManaCost: 0 }], // Bloodrage: health, not mana
      [11581, { PowerType: 1, PowerCostPct: 0, ManaCost: 200 }], // Thunder Clap: 20 rage in tenths
      [5487, { PowerType: 0, PowerCostPct: 55, ManaCost: 0 }],
    ]),
    misc: new Map([
      [100, { RangeIndex: 1 }],
      [11581, { RangeIndex: 2 }],
      [78, { RangeIndex: 3 }],
    ]),
    ranges: new Map([
      [1, { RangeMin: [8, 8], RangeMax: [25, 25], Flags: 0 }], // Charge
      [2, { RangeMin: [0, 0], RangeMax: [0, 0], Flags: 0 }], // self
      [3, { RangeMin: [0, 0], RangeMax: [5, 5], Flags: 1 }], // melee
    ]),
  };

  it("prints costs as the tooltip does, with the client's power type", () => {
    expect(costOf(ctx, 2687)).toEqual({ raw: "20% of base health", amount: null, resource: "health", percentOfBase: 20 });
    expect(costOf(ctx, 11581)).toEqual({ raw: "20 Rage", amount: 20, resource: "rage" });
    expect(costOf(ctx, 5487).raw).toBe("55% of base mana");
    expect(costOf(ctx, 1)).toBeNull();
  });

  it("reads minimum, melee and self ranges", () => {
    expect(rangeOf(ctx, 100)).toEqual({ raw: "8-25 yd range", yards: 25, melee: false, minYards: 8 });
    expect(rangeOf(ctx, 78)).toEqual({ raw: "Melee range", yards: null, melee: true });
    expect(rangeOf(ctx, 11581)).toBeNull();
  });

  it("formats cooldowns and reads rank numbers", () => {
    expect(formatCooldownSeconds(6)).toBe("6 sec");
    expect(formatCooldownSeconds(120)).toBe("2 min");
    expect(formatCooldownSeconds(3600)).toBe("1 hr");
    expect(rankNumber("Rank 12")).toBe(12);
    expect(rankNumber("Shapeshift")).toBeNull();
    expect(rankNumber(null)).toBeNull();
  });
});

describe("pairRows", () => {
  it("pairs numbered ranks by rank number (Slam: Forever's new rank 1 against Classic's rank 1)", () => {
    const pairs = pairRows([row(1240193, 1, 20), row(1464, 2, 30)], [row(1464, 1, 30), row(8820, 2, 38)]);
    expect(pairs.map((p) => [p.rank, p.forever?.spellId, p.classic?.spellId])).toEqual([
      [1, 1240193, 1464],
      [2, 1464, 8820],
    ]);
  });

  it("pairs an unnumbered row by spell id and keeps dropped Classic ranks (Frenzied Regeneration)", () => {
    const pairs = pairRows([row(22842, null, 36)], [row(22842, 1, 36), row(22895, 2, 46), row(22896, 3, 56)]);
    expect(pairs.map((p) => [p.rank, p.forever?.spellId ?? null, p.classic?.spellId])).toEqual([
      [null, 22842, 22842],
      [2, null, 22895],
      [3, null, 22896],
    ]);
  });

  it("pairs a lone unnumbered spell with the highest Classic rank (Tactical Mastery's talent 5/5)", () => {
    const pairs = pairRows([row(1310185, null, 14)], [row(12679, 5, null)]);
    expect(pairs.map((p) => [p.forever.spellId, p.classic.spellId])).toEqual([[1310185, 12679]]);
  });

  it("leaves a Forever-only variant unpaired (Summon Warhorse 1279399)", () => {
    const pairs = pairRows([row(13819, null, 40), row(1279399, null, 40)], [row(13819, null, 40)]);
    expect(pairs.map((p) => [p.forever.spellId, p.classic?.spellId ?? null])).toEqual([
      [13819, 13819],
      [1279399, null],
    ]);
  });
});

describe("differences", () => {
  const rank = (extra) => ({ level: 58, cost: { raw: "20 Rage" }, castTime: { raw: "Instant" }, cooldown: { raw: "4 sec cooldown" }, range: null, school: "physical", forms: ["Battle Stance"], requires: null, text: "x", ...extra });

  it("names each changed field (Thunder Clap)", () => {
    const f = rank({ cooldown: { raw: "6 sec cooldown" }, forms: ["Battle Stance", "Defensive Stance"], text: "Blasts nearby enemies with thunder, increasing the time between their attacks by 20% for 30 sec." });
    const c = rank({ text: "Blasts nearby enemies with thunder increasing the time between their attacks by 10% for 30 sec." });
    expect(rankDifferences(f, c)).toEqual([
      { field: "cooldown", text: "6 sec cooldown instead of 4 sec cooldown" },
      { field: "form", text: "Usable in Battle Stance, Defensive Stance (Classic: Battle Stance)" },
      { field: "value", text: "20 instead of 10, reworded" },
    ]);
    expect(rankDifferences(c, c)).toEqual([]);
  });

  it("tells rewording from rewriting", () => {
    expect(textChange("Unleash the energy of a Seal.", "Unleashes the energy of a Seal.")).toEqual({ field: "text", text: "Same numbers, reworded" });
    expect(textChange("Summons a warhorse.", "Summons a warhorse. Speed is increased by 60%.")).toEqual({ field: "text", text: "Tooltip rewritten" });
    expect(textChange("Same  text.", "same text.")).toBeNull();
  });
});

describe("races that can learn a spell", () => {
  const paladinRaces = [
    { bit: 0, name: "Human" },
    { bit: 2, name: "Dwarf" },
    { bit: 4, name: "Undead" },
  ];

  it("lists them from the race masks, or null for all (Summon Charger: Human and Dwarf)", () => {
    expect(learnableBy([row(23214, null, 60, { raceMasks: [[5, 0]] })], paladinRaces)).toEqual(["Dwarf", "Human"]);
    expect(learnableBy([row(13819, null, 40, { raceMasks: [[1029, 0]] }), row(1279399, null, 40)], paladinRaces)).toBeNull();
  });

  it("reads race bits past 31 (Skyborne are 32 and 33)", () => {
    expect(maskHasRace([0, 3], 33)).toBe(true);
    expect(maskHasRace([0, 1], 33)).toBe(false);
    expect(maskHasRace([0, 0], 33)).toBe(true);
  });
});

describe("readBook", () => {
  // A warrior's Arms line with one row per rule, plus the Engraving line.
  const spells = [
    [78, "Heroic Strike", "Rank 1", 1, 0x50010, 2],
    [284, "Heroic Strike", "Rank 2", 8, 0x50010, 0],
    [20647, "Execute", "", 1, 0x40010, 0], // an unnumbered component of a ranked spell
    [5308, "Execute", "Rank 1", 24, 0x50110, 0],
    [21156, "Battle Stance Passive", "", 1, 0x500d0, 0], // hidden
    [403228, "Meathook", "", 1, 0, 3], // granted by another spell (a rune)
    [12292, "Sweeping Strikes", "", 1, 0x40010, 0], // an active talent, no class mask
    [12723, "Sweeping Strikes", "Rank 1", 1, 0x40010, 0], // a proc effect, no class mask, no family
    [5421, "Aquatic Form (Passive)", "Passive", 16, 0x50, 0], // read by Aquatic Form
    [1066, "Aquatic Form", "Shapeshift", 16, 0x50010, 0],
    [403446, "Engrave Pants - Commanding Shout", "", 1, 0x10040020, 0], // Engraving line
    [461475, "Valor of Azeroth", "", 2, 0, 0], // Season of Discovery id range in Classic Era
    [9999, "No Level", "", 0, 0, 0],
  ];
  const lines = { 26: "Arms", 2851: "Engraving" };
  const t = {
    ChrClasses: byId([{ ID: 1, Name_lang: "Warrior" }]),
    SkillLine: byId(Object.entries(lines).map(([id, name]) => ({ ID: Number(id), DisplayName_lang: name, CategoryID: 7, SpellIconFileID: 132292 }))),
    SkillLineAbility: byId(
      spells.map(([id, , , , , acq], i) => ({ ID: i + 1, SkillLine: id === 403446 ? 2851 : 26, Spell: id, ClassMask: [12292, 12723].includes(id) ? 0 : 1, AcquireMethod: acq, SupercedesSpell: 0, RaceMasks: [0, 0] })),
    ),
    SpellName: byId(spells.map(([id, name]) => ({ ID: id, Name_lang: name }))),
    Spell: byId(spells.map(([id, , sub]) => ({ ID: id, NameSubtext_lang: sub, Description_lang: id === 1066 ? "Increases swim speed by $5421s1%." : `Spell ${id}.` }))),
    SpellMisc: byId(spells.map(([id, , , , attr], i) => ({ ID: i + 1, SpellID: id, DifficultyID: 0, Attributes: [attr, 0] }))),
    SpellLevels: byId(spells.map(([id, , , level], i) => ({ ID: i + 1, SpellID: id, DifficultyID: 0, BaseLevel: level, SpellLevel: level }))),
    SpellClassOptions: byId(spells.filter(([id]) => id !== 12723).map(([id], i) => ({ ID: i + 1, SpellID: id, SpellClassSet: 4 }))),
    SpellPower: byId([]),
    SpellCooldowns: byId([]),
    SpellCastTimes: byId([]),
    SpellRange: byId([]),
    SpellShapeshift: byId([]),
    SpellShapeshiftForm: byId([]),
    SpellEquippedItems: byId([]),
    ItemSubClass: byId([]),
  };
  const ctx = createBookContext(t, { text: createSpellTextContext(t), iconName: () => "icon" });
  const talents = [
    { name: "Sweeping Strikes", tabName: "Arms", spellIds: [12292], active: true },
    { name: "Tactical Mastery", tabName: "Arms", spellIds: [12295, 12676], active: false },
  ];
  const book = readBook(ctx, "warrior", { talents, talentTabs: [{ name: "Arms", iconFileDataId: 1 }], classic: true });
  const why = Object.fromEntries(book.excluded.map((x) => [x.id, x.why]));

  it("keeps trained and automatic ranks, and active talents", () => {
    expect([...book.spells.values()].map((s) => [s.name, s.rows.map((r) => r.spellId)])).toEqual([
      ["Heroic Strike", [78, 284]],
      ["Execute", [5308]],
      ["Sweeping Strikes", [12292]],
      ["Aquatic Form", [1066]],
    ]);
    const sweeping = book.spells.get("sweepingstrikes");
    expect([sweeping.isTalent, sweeping.grantedByTalent, sweeping.rows[0].level]).toEqual([true, true, null]);
    expect(book.passiveTalents.has("tacticalmastery")).toBe(true);
    expect(book.tabs.map((x) => x.name)).toEqual(["Arms"]);
  });

  it("says why each other row is left out", () => {
    expect(why).toEqual({
      20647: "unnumbered component of a ranked spell",
      21156: "hidden from the spellbook",
      403228: "acquire method 3",
      5421: "component: read by Aquatic Form's tooltip",
      461475: "Season of Discovery id range",
      9999: "no training level",
    });
    // No row of the Engraving line is a candidate at all, and a family-less proc is never one.
    expect(Object.keys(why)).not.toContain("403446");
    expect(Object.keys(why)).not.toContain("12723");
  });
});

describe("races", () => {
  it("names faction variants and keeps other names (ids are a storage contract)", () => {
    expect(raceNames({ Name_lang: "Windshaper Skyborne", ClientFileString: "Skyborne", Alliance: 1 })).toEqual({
      faction: "Horde",
      baseName: "Skyborne",
      variant: "Windshaper",
      name: "Skyborne (Windshaper)",
      id: "horde-skyborne-windshaper",
    });
    expect(raceNames({ Name_lang: "Night Elf", ClientFileString: "NightElf", Alliance: 0 }).id).toBe("alliance-night-elf");
    expect(raceNames({ Name_lang: "Undead", ClientFileString: "Scourge", Alliance: 1 })).toMatchObject({ id: "horde-undead", name: "Undead" });
  });

  it("gives racials ids by race, or by both factions of a race", () => {
    expect(racialId("Elune's Light", [{ Name_lang: "Night Elf", ClientFileString: "NightElf" }])).toBe("racial-night-elf-elune-s-light");
    expect(racialId("Skysight", [{ Name_lang: "Windshaper Skyborne", ClientFileString: "Skyborne" }])).toBe("racial-windshaper-skyborne-skysight");
    const both = [
      { Name_lang: "Windshaper Skyborne", ClientFileString: "Skyborne" },
      { Name_lang: "High Order Skyborne", ClientFileString: "Skyborne" },
    ];
    expect(racialId("Walk on Air", both)).toBe("racial-skyborne-both-factions-walk-on-air");
  });

  it("groups per-class variants by text, in the order they first appear (Eureka!)", () => {
    const groups = groupByText([
      { classIds: [4], text: "Energy" },
      { classIds: [9], text: "Mana" },
      { classIds: [5], text: "Priest" },
      { classIds: [8], text: "Mana" },
    ]);
    expect(groups).toEqual([
      { classIds: [4], text: "Energy" },
      { classIds: [9, 8], text: "Mana" },
      { classIds: [5], text: "Priest" },
    ]);
  });

  it("reads class masks in class id order (0 and −1 mean every class)", () => {
    const ids = [1, 2, 3, 4, 5, 7, 8, 9, 11];
    expect(classesOfMask(11, ids)).toEqual([1, 2, 4]); // Touch of the Grave: warrior, paladin, rogue
    expect(classesOfMask(400, ids)).toEqual([5, 8, 9]);
    expect(classesOfMask(-1, ids)).toEqual(ids);
  });
});
