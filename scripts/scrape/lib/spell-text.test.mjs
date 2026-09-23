// Unit tests for the spell description renderer (scripts/scrape/lib/spell-text.mjs). The rows
// are shaped like the client's (Forever 1.60.1 and Classic Era 1.15.9 layouts); the descriptions
// and values are the real ones of the named spells, trimmed to the columns the renderer reads.
import { describe, expect, it } from "vitest";
import { createSpellTextContext, effectRange, evaluate, formatCooldown, formatDuration, renderSpellText } from "./spell-text.mjs";

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
    expect(text(900001)).toEqual({ text: "Restores 1 charge and deals 140 damage.", unrendered: [] });
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
