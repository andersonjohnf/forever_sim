// Item effects the tooltip parser leaves as text: the engine's documented override layer
// (docs/doctrine.md#3-data). Each entry cites where its numbers come from. An equipped item with a
// proc or use effect that isn't here is reported as not simulated.
import type { Effect } from './types'

const PROC_DOC = 'docs/mechanics/damage-and-timing.md#52-ppm-vs-flat-chance-classic-era-examples'

export interface ItemEffects {
  effects: Effect[]
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
