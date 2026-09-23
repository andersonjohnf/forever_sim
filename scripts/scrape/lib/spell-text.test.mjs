// Unit tests for the spell description renderer (scripts/scrape/lib/spell-text.mjs). The rows
// are shaped like the client's (Forever 1.60.1 and Classic Era 1.15.9 layouts); the descriptions
// and values are the real ones of the named spells, trimmed to the columns the renderer reads.
import { describe, expect, it } from "vitest";
import { createSpellTextContext, effectRange, evaluate, formatCooldown, formatDuration, renderSpellText, scalingLevels } from "./spell-text.mjs";

/** Forever layout: EffectBasePointsF (+ Variance). */
const fx = (SpellID, EffectIndex, EffectBasePointsF, extra = {}) => ({ SpellID, EffectIndex, DifficultyID: 0, Effect: 6, EffectAura: 0, EffectBasePointsF, Variance: 0, EffectAuraPeriod: 0, EffectRadiusIndex: [0, 0], EffectMiscValue: [0, 0], ...extra });
/** Classic Era layout: EffectBasePoints + EffectDieSides (old convention). */
const cx = (SpellID, EffectIndex, EffectBasePoints, EffectDieSides, extra = {}) => ({ ...fx(SpellID, EffectIndex, 0, extra), EffectBasePoints, EffectDieSides });

const ctx = createSpellTextContext({
  Spell: [
    { ID: 1291097, Description_lang: "Absorbs $s1 damage for $d. If this shield expires before $d, $1291099s1 Nature damage will be dealt to all enemies in melee range." },
    { ID: 1291099, Description_lang: "" },
    { ID: 22778, Description_lang: "Hamstring Rage cost reduced by $/10;s1." },
    { ID: 1291059, Description_lang: "Reduces the cooldown of your Tiger's Fury ability by ${$m1/-1000} sec." },
    { ID: 7598, Description_lang: "Improves your chance to get a critical strike with melee attacks by ${$s1}.1%." },
    { ID: 27778, Description_lang: "When struck in combat has a $h% chance of shielding the wearer in a protective shield which will absorb $27779s1 damage. Can only occur once every $proccooldown sec." },
    { ID: 27779, Description_lang: "" },
    { ID: 17407, Description_lang: "Wounds the target for $s1 damage and deals an additional $s2 damage every $t2 sec for $d." },
    { ID: 13318, Description_lang: "Wounds the target causing them to bleed for $o1 damage over $d." },
    { ID: 8191, Description_lang: "A burst of energy fills the caster, increasing $ghis:her; damage by $s1 and armor by $s2 for $d." },
    { ID: 25892, Description_lang: "Reduces your threat to enemy targets within $a1 yards." },
    { ID: 363880, Description_lang: "$@spelldesc24427" },
    { ID: 24427, Description_lang: "Increases attack power by $s1 for $d." },
    { ID: 900001, Description_lang: "Restores $s1 $lcharge:charges; and deals $<damage> damage." },
    { ID: 900002, Description_lang: "Teleports you to $z. $?s12345[Faster.][Slower.]" },
    // Forever talents: Anger Management (a fourth effect), Feral Charge ($? with colour codes and
    // $@spelltooltip), and synthetic chains and negations.
    { ID: 12296, Description_lang: "Generates $m2 Rage every $m3 sec while in combat, and reduces Rage loss while out of combat by $s4%." },
    {
      ID: 1238122,
      Description_lang:
        "$?a5487|a9634[|CFFFFFFFFRequires Bear Form, Dire Bear Form|R][|CFFFF2020Requires Bear Form, Dire Bear Form|R]\r\nCharge an enemy.\r\n\r\n$@spelltooltip414924",
    },
    { ID: 414924, Description_lang: "Leap behind an enemy." },
    { ID: 900003, Description_lang: "$?!s1[Not known.][Known.] $?a1[A]?(a2|!a3)&!s4[B][C] $?s5[only if known]end" },
    { ID: 900004, Description_lang: "Outer,\r\nwrapped.\r\n\r\n$@spelldesc900005" },
    { ID: 900005, Description_lang: "Inner one.\r\n\r\nInner two." },
  ],
  SpellName: [{ ID: 24427, Name_lang: "Diamond Flask" }],
  SpellEffect: [
    fx(1291097, 0, 450),
    fx(1291099, 0, 100, { Effect: 2, Variance: 0.2 }),
    fx(22778, 0, -30),
    fx(1291059, 0, -3000),
    fx(7598, 0, 1),
    fx(27779, 0, 350),
    cx(17407, 0, 29, 11, { Effect: 2 }),
    cx(17407, 1, 29, 1, { EffectAuraPeriod: 3000 }),
    fx(13318, 0, 10, { EffectAuraPeriod: 3000 }),
    cx(8191, 0, 9, 1),
    cx(8191, 1, 49, 1),
    fx(25892, 0, 0, { EffectRadiusIndex: [0, 8] }),
    fx(24427, 0, 300),
    fx(900001, 0, 1),
    fx(900001, 1, 40),
    fx(12296, 0, 15),
    fx(12296, 1, 1),
    fx(12296, 2, 3),
    fx(12296, 3, 30),
  ],
  SpellMisc: [
    { SpellID: 1291097, DifficultyID: 0, DurationIndex: 1 },
    { SpellID: 17407, DifficultyID: 0, DurationIndex: 2 },
    { SpellID: 13318, DifficultyID: 0, DurationIndex: 2 },
    { SpellID: 8191, DifficultyID: 0, DurationIndex: 1 },
    { SpellID: 24427, DifficultyID: 0, DurationIndex: 3 },
  ],
  SpellDuration: [
    { ID: 1, Duration: 15000 },
    { ID: 2, Duration: 12000 },
    { ID: 3, Duration: 60000 },
  ],
  SpellAuraOptions: [{ SpellID: 27778, DifficultyID: 0, ProcChance: 10, ProcCharges: 0, CumulativeAura: 0, ProcCategoryRecovery: 60000 }],
  SpellRadius: [{ ID: 8, Radius: 5 }],
  SpellRange: [],
  SpellTargetRestrictions: [],
  SpellDescriptionVariables: [{ ID: 1, Variables: "$damage=${$s2*2+$PL}" }],
  SpellXDescriptionVariables: [{ SpellID: 900001, SpellDescriptionVariablesID: 1 }],
});
const text = (id) => renderSpellText(ctx, id);

describe("effect points", () => {
  it("Forever: the value, or a spread rounded at both ends", () => {
    expect(effectRange(fx(1, 0, 450))).toEqual({ min: 450, max: 450 });
    expect(effectRange(fx(1, 0, 616, { Variance: 0.2 }))).toEqual({ min: 554, max: 678 }); // Talisman of Arathor
  });

  it("Classic Era: min = base + 1, max = base + die sides", () => {
    expect(effectRange(cx(1, 0, 19, 1))).toEqual({ min: 20, max: 20 }); // Hand of Justice's +20 AP
    expect(effectRange(cx(1, 0, 29, 11))).toEqual({ min: 30, max: 40 });
    expect(effectRange(cx(1, 0, 5, 0))).toEqual({ min: 5, max: 5 });
  });
});

describe("renderSpellText", () => {
  it("renders values, durations and another spell's values (Adaptive Combat Assistant)", () => {
    expect(text(1291097)).toEqual({
      text: "Absorbs 450 damage for 15 sec. If this shield expires before 15 sec, 90 to 110 Nature damage will be dealt to all enemies in melee range.",
      unrendered: [],
      assumed: [],
    });
  });

  it("scales a token ($/10;s1) and shows its absolute value", () => {
    expect(text(22778).text).toBe("Hamstring Rage cost reduced by 3.");
  });

  it("evaluates ${…} with signed tokens, and .N decimals", () => {
    expect(text(1291059).text).toBe("Reduces the cooldown of your Tiger's Fury ability by 3 sec.");
    expect(text(7598).text).toBe("Improves your chance to get a critical strike with melee attacks by 1.0%.");
  });

  it("renders proc chance and internal cooldown", () => {
    expect(text(27778).text).toBe(
      "When struck in combat has a 10% chance of shielding the wearer in a protective shield which will absorb 350 damage. Can only occur once every 60 sec.",
    );
  });

  it("renders ranges, periods and totals over the duration", () => {
    expect(text(17407).text).toBe("Wounds the target for 30 to 40 damage and deals an additional 30 damage every 3 sec for 12 sec.");
    expect(text(13318).text).toBe("Wounds the target causing them to bleed for 40 damage over 12 sec.");
  });

  it("takes the first gender form, radii and included descriptions", () => {
    expect(text(8191).text).toBe("A burst of energy fills the caster, increasing his damage by 10 and armor by 50 for 15 sec.");
    expect(text(25892).text).toBe("Reduces your threat to enemy targets within 5 yards.");
    expect(text(363880).text).toBe("Increases attack power by 300 for 1 min.");
  });

  it("picks plurals by the last number and evaluates description variables", () => {
    expect(text(900001)).toEqual({ text: "Restores 1 charge and deals 140 damage.", unrendered: [], assumed: [] });
  });

  it("reads effect indexes past 3 (Anger Management's $s4)", () => {
    expect(text(12296).text).toBe("Generates 1 Rage every 3 sec while in combat, and reduces Rage loss while out of combat by 30%.");
  });

  it("strips upper-case colour codes and includes $@spelltooltip", () => {
    expect(text(1238122).text).toContain("Charge an enemy. Leap behind an enemy.");
    expect(text(1238122).text).not.toMatch(/\|[CcRr]/);
  });

  it("reports $? conditions unless asked to take them as unmet", () => {
    expect(text(1238122).unrendered).toEqual(["$?a5487|a9634"]);
    const unmet = renderSpellText(ctx, 1238122, { conditions: "unmet" });
    expect(unmet.text).toBe("Requires Bear Form, Dire Bear Form Charge an enemy. Leap behind an enemy.");
    expect(unmet.unrendered).toEqual([]);
    expect(unmet.assumed).toEqual(["$?a5487|a9634"]);
  });

  it("keeps a blank line as one paragraph break when asked, through $@ inclusions", () => {
    expect(renderSpellText(ctx, 900004, { paragraphs: true }).text).toBe("Outer, wrapped.\nInner one.\nInner two.");
    expect(renderSpellText(ctx, 900004).text).toBe("Outer, wrapped. Inner one. Inner two.");
  });

  // L37: Feral Charge's "Requires" line is a line of its own, not the start of the sentence.
  it("keeps a line break after a line that ends (a coloured header or a sentence), and wraps the rest", () => {
    const text = renderSpellText(ctx, 1238122, { conditions: "unmet", paragraphs: true }).text;
    expect(text).toBe("Requires Bear Form, Dire Bear Form\nCharge an enemy.\nLeap behind an enemy.");
    expect(renderSpellText(ctx, 1238122, { conditions: "unmet", lines: true }).text).toBe("Requires Bear Form, Dire Bear Form\nCharge an enemy.\n\nLeap behind an enemy.");
    // One-line texts (item effects) still join every line with a space.
    expect(renderSpellText(ctx, 1238122, { conditions: "unmet" }).text).toBe("Requires Bear Form, Dire Bear Form Charge an enemy. Leap behind an enemy.");
    // Weaponmaster (1290261) wraps sentences over lines: those breaks are spaces.
    const wrapped = createSpellTextContext({
      Spell: [{ ID: 1290261, Description_lang: "Gives your melee weapon attacks a benefit depending on the weapon.\r\n\r\n    |CFFFFFFFFAxe/Polearm:|R Increases your\r\n    critical strike chance by $s1%.\r\n\r\n    |CFFFFFFFFSword:|R Your successful melee \r\n    attacks have a $s3% chance to \r\n    trigger an extra attack on the \r\n    target." }],
      SpellEffect: [fx(1290261, 0, 1), fx(1290261, 2, 1)],
    });
    expect(renderSpellText(wrapped, 1290261, { paragraphs: true }).text).toBe(
      "Gives your melee weapon attacks a benefit depending on the weapon.\nAxe/Polearm: Increases your critical strike chance by 1%.\nSword: Your successful melee attacks have a 1% chance to trigger an extra attack on the target.",
    );
  });

  it("applies !, &, | and parentheses, chains, and a missing else branch", () => {
    const unmet = renderSpellText(ctx, 900003, { conditions: "unmet" });
    expect(unmet.text).toBe("Not known. B end");
    expect(unmet.assumed).toEqual(["$?!s1", "$?a1", "$?(a2|!a3)&!s4", "$?s5"]);
  });

  it("reports what it can't render", () => {
    expect(text(900002).unrendered).toEqual(["$z", "$?s12345"]);
  });
});

describe("formatting", () => {
  it("durations and cooldowns read like the tooltip", () => {
    expect(formatDuration(15000)).toBe("15 sec");
    expect(formatDuration(90000)).toBe("1.5 min");
    expect(formatDuration(3600000)).toBe("1 hour");
    expect(formatCooldown(120000)).toBe("2 Min");
    expect(formatCooldown(75000)).toBe("1 Min 15 Sec");
    expect(formatCooldown(3600000)).toBe("1 Hour");
  });

  it("evaluate handles precedence, parentheses and functions", () => {
    expect(evaluate(ctx, 0, "1+2*3")).toBe(7);
    expect(evaluate(ctx, 0, "(1+2)*3")).toBe(9);
    expect(evaluate(ctx, 0, "$max(2, $floor(3.7))")).toBe(3);
    expect(evaluate(ctx, 0, "-4/2")).toBe(-2);
    expect(evaluate(ctx, 0, "1+")).toBeNull();
  });
});

// Spellbook options (M1.5e): real rows of Forever Execute, Rip, Tranquility and Victory Rush,
// Classic Era Rip, and Find Treasure.
describe("spellbook rendering", () => {
  const book = createSpellTextContext(
    {
      Spell: [
        { ID: 20662, Description_lang: "Attempt to finish off a wounded foe, causing $s1 damage and converting each extra point of rage into $*10;F1 additional damage." },
        {
          ID: 9896,
          Description_lang: "Finishing move that causes damage over time.  Damage increases per combo point:\r\n   1 point  : ${6*($m1+$b1)} damage over $d.\r\n   2 points: ${6*($m1+2*$b1)} damage over $d.\r\n",
        },
        { ID: 99896, Description_lang: "   1 point  : ${$<ticks>*$<mult>*($m1+$b1)} damage over $d." },
        { ID: 740, Description_lang: "Regenerates all nearby party members for $?$p456322[${$m1*2}][$s1] every $t1 sec." },
        { ID: 402927, Description_lang: "Instantly attack the target causing ${1+$AP*$m3/100} damage." },
        { ID: 2481, Description_lang: "Allows the dwarf to sense nearby treasure.  Lasts $d." },
      ],
      SpellName: [],
      SpellEffect: [
        fx(20662, 0, 600, { EffectChainAmplitude: 1.5 }),
        fx(9896, 0, 15, { EffectPointsPerResource: 25.5, EffectAuraPeriod: 2000 }),
        { ...cx(99896, 0, 16, 1, { EffectAuraPeriod: 2000 }), EffectPointsPerResource: 28 },
        fx(740, 0, 87, { EffectAuraPeriod: 2000 }),
        fx(402927, 2, 15),
      ],
      SpellMisc: [
        { SpellID: 9896, DifficultyID: 0, DurationIndex: 29 },
        { SpellID: 99896, DifficultyID: 0, DurationIndex: 29 },
        { SpellID: 2481, DifficultyID: 0, DurationIndex: 21 },
      ],
      SpellDuration: [
        { ID: 21, Duration: -1 },
        { ID: 29, Duration: 12000 },
      ],
      SpellAuraOptions: [],
      SpellRadius: [],
      SpellRange: [],
      SpellTargetRestrictions: [],
      SpellDescriptionVariables: [{ ID: 865, Variables: "$ticks=$?s436895[${8}][${6}]\r\n$mult=$?s436895[${1.5}][${1.0}]" }],
      SpellXDescriptionVariables: [{ SpellID: 99896, SpellDescriptionVariablesID: 865 }],
    },
    { stats: { AP: 0 } },
  );
  const opts = { conditions: "unmet", lines: true, wholeExpressions: true };

  it("reads $f1 as the effect's chain amplitude (Execute's rage-to-damage factor)", () => {
    expect(renderSpellText(book, 20662, opts).text).toContain("into 15 additional damage");
  });

  it("keeps line breaks and shows ${…} as whole numbers (Rip)", () => {
    expect(renderSpellText(book, 9896, opts).text).toBe(
      "Finishing move that causes damage over time. Damage increases per combo point:\n1 point : 243 damage over 12 sec.\n2 points: 396 damage over 12 sec.",
    );
    expect(renderSpellText(book, 9896, { conditions: "unmet" }).text).toContain("1 point : 243 damage over 12 sec. 2 points: 396");
  });

  it("evaluates description variables written as conditions (Classic Era Rip: 6 ticks × 1.0)", () => {
    expect(renderSpellText(book, 99896, opts)).toMatchObject({ text: "1 point : 270 damage over 12 sec.", unrendered: [] });
    expect(renderSpellText(book, 99896, { lines: true }).unrendered).toEqual(["${$<ticks>*$<mult>*($m1+$b1)}"]);
  });

  it("takes a $-prefixed condition atom ($?$p456322) as unmet (Tranquility)", () => {
    expect(renderSpellText(book, 740, opts)).toMatchObject({ text: "Regenerates all nearby party members for 87 every 2 sec.", assumed: ["$?$p456322"] });
  });

  it("reads $AP only when the caller gives player stats (Victory Rush)", () => {
    expect(renderSpellText(book, 402927, opts).text).toBe("Instantly attack the target causing 1 damage.");
    const bare = createSpellTextContext({ Spell: [{ ID: 1, Description_lang: "${1+$AP}" }], SpellEffect: [] });
    expect(renderSpellText(bare, 1).unrendered).toEqual(["${1+$AP}"]);
  });

  it("reads a duration of −1 as until cancelled (Find Treasure)", () => {
    expect(renderSpellText(book, 2481, opts).text).toBe("Allows the dwarf to sense nearby treasure. Lasts until cancelled.");
  });
});

// L9: per-level points at level 60 (docs/data/items.md#per-level-values). Real rows of the
// Forever client 1.60.1.69913 (Demoralizing Shout, Cat and Dire Bear Form, Vindication,
// Judgement of Command) and Classic Era 1.15.9.69722 (Demoralizing Shout, Judgement of Command).
describe("per-level points", () => {
  const lv = (SpellID, BaseLevel, SpellLevel, MaxLevel) => ({ SpellID, DifficultyID: 0, BaseLevel, SpellLevel, MaxLevel });

  it("count the levels from SpellLevel to 60, capped by MaxLevel", () => {
    expect(scalingLevels(lv(11556, 54, 54, 64))).toBe(6); // Demoralizing Shout rank 5
    expect(scalingLevels(lv(3025, 6, 6, 0))).toBe(54); // Cat Form (Passive): no cap
    expect(scalingLevels(lv(1178, 10, 10, 40))).toBe(30); // Bear Form (Passive): capped at 40
    expect(scalingLevels(lv(440667, 0, 1, 60))).toBe(59); // SpellLevel, not Forever's zeroed BaseLevel
    expect(scalingLevels(lv(1, 0, 99, 43))).toBe(0); // never negative
    expect(scalingLevels(undefined)).toBe(0);
  });

  it("add the truncated per-level term after a spread", () => {
    expect(effectRange(fx(11556, 0, -196, { EffectRealPointsPerLevel: -1.4 }), 6)).toEqual({ min: -204, max: -204 });
    expect(effectRange(cx(11556, 0, -141, 1, { EffectRealPointsPerLevel: -1 }), 6)).toEqual({ min: -146, max: -146 });
    // Judgement of Command 20467 at 60 (8 levels × 5.6 = 44.8): Forever's 97 ± 4 and Classic Era's
    // 93–101 both become 137–145.
    expect(effectRange(fx(20467, 0, 97, { Variance: 0.082474224, EffectRealPointsPerLevel: 5.6 }), 8)).toEqual({ min: 137, max: 145 });
    expect(effectRange(cx(20467, 0, 92, 9, { EffectRealPointsPerLevel: 5.6 }), 8)).toEqual({ min: 137, max: 145 });
    expect(effectRange(fx(1, 0, 12, { EffectRealPointsPerLevel: 2 }))).toEqual({ min: 12, max: 12 }); // no levels: base
  });

  const scaled = createSpellTextContext({
    Spell: [
      { ID: 11556, Description_lang: "Reduces the melee attack power of all enemies within $a1 yards by $s1 for $d." },
      { ID: 768, Description_lang: "Shapeshift into cat form, increasing melee attack power by $3025s1 plus Agility." },
      { ID: 9634, Description_lang: "Shapeshift into a dire bear, increasing melee attack power by $9635s4, armor contribution from items by $9635s1%, and health by $9635s3." },
      { ID: 9452, Description_lang: "Gives your damaging melee attacks a chance to reduce the target's Attack Power by ${$m1/-3*$440667m1}, and increase your Attack Power by $m1% for $440667d." },
    ],
    SpellEffect: [
      fx(11556, 0, -196, { EffectRealPointsPerLevel: -1.4, EffectRadiusIndex: [0, 8] }),
      fx(3025, 0, 12, { EffectRealPointsPerLevel: 2 }),
      fx(9635, 0, 360, { EffectAura: 466 }),
      fx(9635, 1, 360, { EffectAura: 142 }),
      fx(9635, 2, 600, { EffectAura: 230, EffectRealPointsPerLevel: 32 }),
      fx(9635, 3, 120, { EffectAura: 99, EffectRealPointsPerLevel: 3 }),
      fx(9452, 0, 3), // Vindication 3/3 (the talent's rank curve puts 3 here)
      fx(440667, 0, 6, { EffectAura: 99, EffectRealPointsPerLevel: -3.5 }),
    ],
    SpellMisc: [
      { SpellID: 11556, DifficultyID: 0, DurationIndex: 4 },
      { SpellID: 440667, DifficultyID: 0, DurationIndex: 5 },
    ],
    SpellDuration: [
      { ID: 4, Duration: 45000 },
      { ID: 5, Duration: 30000 },
    ],
    SpellRadius: [{ ID: 8, Radius: 10 }],
    SpellLevels: [lv(11556, 54, 54, 64), lv(3025, 6, 6, 0), lv(9635, 40, 40, 70), lv(440667, 0, 1, 60)],
  });
  const render = (id) => renderSpellText(scaled, id, { wholeExpressions: true }).text;

  it("render Demoralizing Shout rank 5 as the level-60 tooltip does: −196 − 1.4 × 6 = −204.4, shown 204", () => {
    expect(render(11556)).toBe("Reduces the melee attack power of all enemies within 10 yards by 204 for 45 sec.");
  });

  it("render Cat Form at 12 + 2 per level from 6: 120", () => {
    expect(render(768)).toBe("Shapeshift into cat form, increasing melee attack power by 120 plus Agility.");
  });

  it("render Dire Bear Form's health at 600 + 32 per level from 40: 1240 (and its attack power 180)", () => {
    expect(render(9634)).toBe("Shapeshift into a dire bear, increasing melee attack power by 180, armor contribution from items by 360%, and health by 1240.");
  });

  it("render Vindication 3/3 from its aura's scaled points: 6 − 3.5 × 59 = −200.5 → −200, and 3/3 of it", () => {
    expect(render(9452)).toBe("Gives your damaging melee attacks a chance to reduce the target's Attack Power by 200, and increase your Attack Power by 3% for 30 sec.");
  });
});
