// Item effects the tooltip parser leaves as text: the engine's documented override layer
// (docs/doctrine.md#3-data). Each entry cites where its numbers come from. An equipped item with a
// proc or use effect that isn't here is reported as not simulated.
import type { Effect, OnUseSpec } from './types'

const PROC_DOC = 'docs/mechanics/damage-and-timing.md#52-ppm-vs-flat-chance-classic-era-examples'

export interface ItemEffects {
  effects: Effect[]
  /** Its use effect, as a cast the rotation presses (warrior.md §5.2 row 3: on-use trinkets). */
  use?: OnUseSpec
  /** Why the entry exists and where the numbers come from. */
  source: string
}

export const ITEM_EFFECTS: Record<number, ItemEffects> = {
  // Hand of Justice: "2% chance on melee hit to gain 1 extra attack"; flat 2% per landed hit [C].
  11815: {
    source: 'Tooltip text; flat 2% per landed hit (WarriorSim gear.js, pre-SoD)',
    effects: [
      {
        kind: 'proc',
        proc: {
          id: 'handOfJustice',
          name: 'Hand of Justice',
          icon: 'inv_jewelry_talisman_01',
          trigger: 'meleeLanded',
          from: 'any',
          chance: { pct: 2 },
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
  // foreverchanges once showed is warrior Q31 [?]).
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
