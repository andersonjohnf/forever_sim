// Item effects the tooltip parser leaves as text: the engine's documented override layer
// (docs/doctrine.md#3-data). Each entry cites where its numbers come from. An equipped item with a
// proc or use effect that isn't here is reported as not simulated.
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
  // Ironfoe: "Grants 2 extra attacks on your next swing"; 0.8 PPM [C].
  11684: {
    source: 'Tooltip text; 0.8 PPM (WarriorSim gear.js, pre-SoD)',
    effects: [
      {
        kind: 'proc',
        proc: {
          id: 'ironfoe',
          name: 'Ironfoe',
          icon: 'inv_mace_10',
          trigger: 'meleeLanded',
          from: 'weapon',
          chance: { ppm: 0.8 },
          action: { kind: 'extraAttacks', count: 2 },
          docRef: PROC_DOC,
        },
      },
    ],
  },
  // Weakness Analyzer (new in Forever): "Use: Increases your critical strike chance with all
  // spells and attacks by 5% for 20 sec or until you deal a non-periodic critical effect."
  // Spell 1291101: aura 290 (all crit) +5 for 20 s with one proc charge; the item's cooldown is
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
      aura: { id: 'analyzingWeaknesses', name: 'Analyzing Weaknesses', durationMs: 20000, critCharges: 1, mods: { crit: 5 } },
      rageTenths: 0,
      rageSpreadTenths: 0,
    },
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
