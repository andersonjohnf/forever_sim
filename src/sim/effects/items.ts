// Item effects the tooltip parser leaves as text: the engine's documented override layer
// (docs/doctrine.md#3-data). Each entry cites where its numbers come from. An equipped item with a
// proc or use effect that isn't here is reported as not simulated.
import type { SpellDef } from '../plan/types'
import type { SpecId } from '../types'
import type { EffectList, OnUseSpec } from './types'

const PROC_DOC = 'docs/mechanics/damage-and-timing.md#52-ppm-vs-flat-chance-classic-era-examples'

/**
 * Hand of Justice's internal cooldown: 15600 `ProcCategoryRecovery` 2000 in both clients [F] [C]
 * (SpellAuraOptions, 1.60.1.69913 and 1.15.9.69722; damage-and-timing §5.2).
 */
export const HAND_OF_JUSTICE_ICD_MS = 2000

export interface ItemEffects {
  /** Its effects, or a function of the rule profile for values the two clients disagree on. */
  effects: EffectList
  /** Its use effect, as a cast the rotation presses (warrior.md §5.2 row 3: on-use trinkets). */
  use?: OnUseSpec
  /** Why the entry exists and where the numbers come from. */
  source: string
}

/**
 * Items whose equip effects name only some specs' abilities, by item id: for any other spec they
 * do nothing, so they aren't flagged as not simulated. An item with an `ITEM_EFFECTS` entry needs
 * none: the entry says what it does for whom (Idol of Brutality, the bear's rotation).
 */
const ITEM_EFFECT_SPECS: Record<number, readonly SpecId[]> = {
  // Totem of Rebirth (22345, spell 27797): "Reduces the Mana cost of Riptide by 5%", a healer's spell
  // (docs/classes/shaman.md#defaults): nothing for a damage spec.
  22345: [],
}

/** Whether an item's equip effects can do anything for this spec (ITEM_EFFECT_SPECS). */
export const itemEffectsApply = (itemId: number, spec: SpecId): boolean => ITEM_EFFECT_SPECS[itemId]?.includes(spec) ?? true

/** Naglering's thorns (15438): 3 Arcane to each attacker that hits you, a damage shield that always lands and never crits [?]. */
const NAGLERING_THORNS: SpellDef = {
  id: 'naglering',
  name: 'Naglering',
  icon: 'inv_jewelry_ring_05',
  school: 'arcane',
  defense: 'none',
  noActiveDefense: true,
  alwaysHit: true,
  triggersProcs: false,
  min: 3,
  max: 3,
  weaponPercent: 0,
  normalized: false,
  spCoefficient: 0,
  takenScale: 0,
  critMultiplier: 1.5,
  bonusCrit: 0,
  damageMult: 1,
  threatMult: 1,
  threatBonus: 0,
  cannotCrit: true,
}

export const ITEM_EFFECTS: Record<number, ItemEffects> = {
  // Hand of Justice (spell 15600, proc mask 0x14: white and yellow melee hits). Forever: ProcChance 3,
  // and "${$h/3}% chance on Melee hit … Attacks against Dwarves are $s2 times as likely" with
  // $s2 = 3, so 1% against a boss that isn't a Dwarf [F]; Classic Era: ProcChance 2, "2% chance on
  // melee hit" [C]. Both have a 2 s internal cooldown (SpellEffect, SpellAuraOptions, Spell,
  // 1.60.1.69913 and 1.15.9.69722; damage-and-timing §5.2).
  11815: {
    source: 'Forever and Classic Era clients: spell 15600’s proc chance, description and internal cooldown',
    effects: (p) => [
      {
        kind: 'proc',
        proc: {
          id: 'handOfJustice',
          name: 'Hand of Justice',
          icon: 'inv_jewelry_talisman_01',
          trigger: 'meleeLanded',
          from: 'any',
          chance: { pct: p.values.handOfJusticePct },
          icdMs: HAND_OF_JUSTICE_ICD_MS,
          action: { kind: 'extraAttacks', count: 1 },
          docRef: PROC_DOC,
        },
      },
    ],
  },
  // Ironfoe: 2 extra attacks (15494, EXTRA_ATTACKS 2 in both clients) from Ironfoe's own hits, in
  // both profiles. Forever: an equip aura, 1301046, otherwise a clone of Hand of Justice's 15600:
  // proc mask 0x14 (white and yellow melee hits) plus a second word, 0x20, that only eight
  // Forever-new item procs carry, two of whose texts say "with this weapon"; ProcChance 6, "Attacks
  // against Orcs are $s2 times as likely" with $s2 = 2 and no chance in the text, read as Hand of
  // Justice's: 3% against a boss that isn't an Orc [?]; ProcCategoryRecovery 100. The client
  // doesn't settle which hand's hits roll it, so the hands are Classic Era's, the weapon's own
  // (doctrine §2); either hand is the alternative to measure [?] (C37). Classic Era: chance on hit
  // (ItemEffect 99055 → 15494), 0.8 PPM [C] (Spell, SpellEffect, SpellAuraOptions, ItemEffect,
  // 1.60.1.69913 and 1.15.9.69722; damage-and-timing §5.2, OQ 15).
  11684: {
    source: 'Forever and Classic Era clients: spell 1301046’s proc chance, description and internal cooldown; Ironfoe’s own hits and 0.8 PPM in Classic Era (WarriorSim gear.js, pre-SoD)',
    effects: (p) => [
      {
        kind: 'proc',
        proc: {
          id: 'ironfoe',
          name: 'Ironfoe',
          icon: 'inv_mace_10',
          trigger: 'meleeLanded',
          from: 'weapon',
          chance: p.values.ironfoe.chance,
          icdMs: p.values.ironfoe.icdMs,
          action: { kind: 'extraAttacks', count: 2 },
          docRef: PROC_DOC,
        },
      },
    ],
  },
  // Weakness Analyzer (new in Forever): "Use: Increases your critical strike chance with all
  // spells and attacks by 5% for 20 sec or until you deal a non-periodic critical effect."
  // Spell 1291101: aura 290 (all crit: attacks and spells) +5 for 20 s with one proc charge; the item's cooldown is
  // 90 s, plus a 20 s one shared by category 1141 ("Burst Trinket"), which no other simulated
  // trinket is in; no GCD [F] [client] (SpellEffect, SpellAuraOptions, ItemEffect, 1.60.1.69913).
  // The charge goes on the first crit dealt, white or special (warrior.md §7; the 2 min cooldown
  // an older tooltip showed is warrior Q31 [?]).
  272438: {
    source: 'Forever client: spell 1291101 and the item effect (1.60.1.69913); its tooltip for what ends it',
    effects: [],
    use: {
      id: 'weaknessAnalyzer',
      name: 'Weakness Analyzer',
      icon: 'inv_misc_blizzcon09_graphicscard',
      cooldownMs: 90000,
      gcdMs: 0,
      aura: { id: 'analyzingWeaknesses', name: 'Analyzing Weaknesses', durationMs: 20000, critCharges: 1, mods: { crit: 5, spellCrit: 5 } },
      rageTenths: 0,
      rageSpreadTenths: 0,
    },
  },
  // Manual Crowd Pummeler (item 9449; its stats are Classic Era's, D6): "Use: Increases your attack
  // speed by 50% for 30 sec." Spell 13494: aura 319 (melee haste) +50 for 30 s, no GCD; the Forever
  // item effect has a 180 s cooldown and 3 charges [F] [client] (SpellEffect, SpellDuration,
  // ItemEffect, 1.60.1.69913; docs/classes/druid.md §7.3). A rotation presses it with its on-use
  // items (a warrior's trinket setting, a cat's on-use setting); that it hastes a druid's form swings
  // is [?] (druid.md Q28).
  9449: {
    source: 'Forever client: spell 13494 and the item effect’s cooldown and charges (1.60.1.69913)',
    effects: [],
    use: {
      id: 'manualCrowdPummeler',
      name: 'Manual Crowd Pummeler',
      icon: 'inv_mace_14',
      cooldownMs: 180000,
      gcdMs: 0,
      aura: { id: 'manualCrowdPummeler', name: 'Haste (Manual Crowd Pummeler)', durationMs: 30000, mods: { haste: 50 } },
      rageTenths: 0,
      rageSpreadTenths: 0,
      charges: 3,
    },
  },
  // Wolfshead Helm (item 8345): "Equip: You gain an additional 5 Rage from activating Enrage and an
  // additional 20 Energy from activating Tiger's Fury." (17768). Nothing on its own: the cat's Tiger's
  // Fury reads it (docs/classes/druid.md §3.6); the bear's Enrage part comes with the bear rotation.
  8345: {
    source: 'Forever client: spell 17768 (1.60.1.69913); the cat rotation’s Tiger’s Fury adds its Energy',
    effects: [],
  },
  // Earthstrike (item 21180): "Use: Increases your melee and ranged attack power by 280. Effect lasts
  // for 20 sec. (2 Min Cooldown)": 25891, aura 99 (+280) for 20000 ms, no GCD, the item's 2 min
  // (docs/classes/shaman.md#defaults, its pre-raid BiS trinket).
  21180: {
    source: 'Forever client: spell 25891 (1.60.1.69913) and the item’s tooltip cooldown',
    effects: [],
    use: {
      id: 'earthstrike',
      name: 'Earthstrike',
      icon: 'spell_nature_abolishmagic',
      cooldownMs: 120000,
      gcdMs: 0,
      aura: { id: 'earthstrike', name: 'Earthstrike', durationMs: 20000, mods: { ap: 280 } },
      rageTenths: 0,
      rageSpreadTenths: 0,
    },
  },
  // Idol of Brutality (item 23198): "Equip: Reduces the Rage cost of Maul and Swipe by 2." (28855: aura
  // 107, misc 14 (cost), −20 tenths of rage on class mask [2048, 64]: Maul and Swipe's 0x800 and Mangle's
  // 0x40 in the second word) [F] [client] (SpellEffect, 1.60.1.69913). Nothing on its own: the bear's
  // rotation takes 2 rage off Maul, Swipe and Mangle (docs/classes/druid.md §4.1, §4.2, §4.4; Mangle by
  // the mask, which the tooltip doesn't name [?]). The cat's relic too, where it does nothing.
  23198: {
    source: 'Forever client: spell 28855’s cost modifier and class mask (1.60.1.69913); the bear rotation takes the rage off',
    effects: [],
  },
  // Totem of Rage (item 22395): "Equip: Increases the damage of your Shock spells by 2%." (27859). Nothing
  // on its own: the shaman's shocks read it (docs/classes/shaman.md#shocks-and-lightning-bolt).
  22395: {
    source: 'Forever client: spell 27859 (1.60.1.69913); the shaman rotation’s shocks add its 2%',
    effects: [],
  },
  // Totem of the Storm (item 23199): "Equip: Increases damage done by Chain Lightning and Lightning Bolt
  // by up to 33." (28857, aura 112: a class script). Nothing on its own: the shaman's Lightning Bolt and
  // Chain Lightning read it (docs/classes/shaman.md#elemental-defaults, its pre-raid BiS relic).
  23199: {
    source: 'Forever client: spell 28857 (1.60.1.69913); the shaman rotations’ Lightning Bolt and Chain Lightning add its 33 spell damage',
    effects: [],
  },
  // Naglering: "When struck in combat inflicts 3 Arcane damage to the attacker" (equip 15438, aura 15, a
  // damage shield, 3, school mask 64) [F] [client] (SpellEffect, 1.60.1.69913). As every damage shield
  // (Retribution Aura's, docs/classes/paladin.md#other-abilities): on each of the boss's swings that
  // lands on you, a blocked one too; it always lands and never crits [?]; Arcane, so no Righteous Fury.
  11669: {
    source: 'Forever client: spell 15438 (1.60.1.69913); the damage-shield rule of Retribution Aura (paladin.md)',
    effects: [
      {
        kind: 'proc',
        proc: {
          id: 'naglering',
          name: 'Naglering',
          icon: 'inv_jewelry_ring_05',
          trigger: 'meleeTaken',
          from: 'any',
          chance: { pct: 100 },
          action: { kind: 'spell', spell: NAGLERING_THORNS },
          docRef: 'docs/classes/paladin.md#other-abilities',
        },
      },
    ],
  },
  // Flurry Axe: "Grants 1 extra attack on your next swing"; 1.8 PPM [C].
  871: {
    source: 'Tooltip text; 1.8 PPM (WarriorSim gear.js, pre-SoD)',
    effects: [
      {
        kind: 'proc',
        proc: {
          id: 'flurryAxe',
          name: 'Flurry Axe',
          icon: 'inv_axe_17',
          trigger: 'meleeLanded',
          from: 'weapon',
          chance: { ppm: 1.8 },
          action: { kind: 'extraAttacks', count: 1 },
          docRef: PROC_DOC,
        },
      },
    ],
  },
}
