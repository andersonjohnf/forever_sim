// Random Retribution setups for retribution-apl.test.ts's check that the priority list's default
// order gives the plans the rotation gave before the list (decision D31). A seeded generator, so the
// cases and their snapshot are the same every run; not part of the app.
//
// The settings are drawn from a frozen description of the options as they were when the snapshot was
// taken (PRE_LIST_OPTIONS), not from RETRIBUTION_OPTIONS, so a setting added later, or a choice that
// gains a value, can't change what's drawn (as protection-apl-cases.ts does).
import { defaultConfig } from '../../defaults'
import type { RotationValue, SimConfig } from '../../types'

type Frozen = { id: string; kind: 'toggle' } | { id: string; kind: 'number'; min: number; max: number; step: number } | { id: string; kind: 'choice'; choices: readonly string[] }

const toggle = (id: string): Frozen => ({ id, kind: 'toggle' })
const number = (id: string, min: number, max: number, step: number): Frozen => ({ id, kind: 'number', min, max, step })

/** The Retribution paladin's settings when the snapshot was taken (A2), in RETRIBUTION_OPTIONS' order then. */
export const PRE_LIST_OPTIONS: readonly Frozen[] = [
  { id: 'paladin.retribution.seal.primary', kind: 'choice', choices: ['command', 'righteousness'] },
  toggle('paladin.retribution.judgementOfTheCrusader.enabled'),
  toggle('paladin.retribution.trinkets.enabled'),
  toggle('paladin.retribution.jujuFlurry.enabled'),
  number('paladin.retribution.seal.refreshBelowSec', 0, 29, 0.5),
  toggle('paladin.retribution.judgement.enabled'),
  toggle('paladin.retribution.holyStrike.enabled'),
  toggle('paladin.retribution.exorcism.enabled'),
  number('paladin.retribution.exorcism.minManaPct', 0, 100, 5),
  toggle('paladin.retribution.consecration.enabled'),
  number('paladin.retribution.consecration.minManaPct', 0, 100, 5),
  toggle('paladin.retribution.consecrationRank1.enabled'),
  number('paladin.retribution.consecrationRank1.minManaPct', 0, 100, 5),
  toggle('paladin.retribution.hammerOfWrath.enabled'),
  number('paladin.retribution.hammerOfWrath.minManaPct', 0, 100, 5),
  toggle('paladin.retribution.manaPotion.enabled'),
  number('paladin.retribution.manaPotion.earlyMissingMana', 0, 5000, 50),
  number('paladin.retribution.manaPotion.missingMana', 0, 5000, 50),
  toggle('paladin.retribution.rune.enabled'),
  number('paladin.retribution.rune.earlyMissingMana', 0, 5000, 50),
  number('paladin.retribution.rune.missingMana', 0, 5000, 50),
]

/**
 * Talent builds: the default, the Ret slice's and the talent migration's interim (paladin.md
 * "Retribution defaults"), and one short of Vengeance, Champion of the Light, Instrument of Law and
 * Twist of Light.
 */
const TALENTS = ['51003-503-05225331001330321', '52003-503-05215331001330321', '50003-503-05205331001330321', '51003-503-052253310013']
const RACES = ['alliance-human', 'alliance-dwarf', 'horde-undead', 'horde-tauren']
/** Main hands: Blackblade of Shahram (the default), the Arcanite Reaper (a two-hander), Ironfoe (a mace) and the Flurry Axe (one-handers). */
const MAIN_HANDS = [12592, 12784, 11684, 871]
const CREATURES = ['none', 'undead', 'demon', 'beast'] as const
/** Consumables the rotation presses, on or off in Buffs. */
const CONSUMABLES = ['majorManaPotion', 'demonicRune', 'jujuFlurry']
/** Worn in place of the default trinkets, sometimes: the two on-use trinkets the rotation presses. */
const ON_USE = [272438, 21180]

/**
 * `count` configs: about half the rotation's settings set at random; talents, race, main hand,
 * trinkets, consumables, execute phase, creature type and the JotC rule at random. None stores an
 * order: the default order is what an old setup loads with.
 */
export function retributionCases(count: number, seed = 20260925): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const base = defaultConfig('paladin-retribution')
  const out: SimConfig[] = []
  for (let i = 0; i < count; i++) {
    const rotation: Record<string, RotationValue> = {}
    for (const o of PRE_LIST_OPTIONS) {
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[o.id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[o.id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[o.id] = pick(o.choices)
    }
    const gear = { ...base.gear, mainHand: { itemId: pick(MAIN_HANDS) } }
    if (rnd() < 0.3) gear.trinket1 = { itemId: pick(ON_USE) }
    const consumables = CONSUMABLES.filter(() => rnd() < 0.5)
    out.push({
      ...base,
      race: pick(RACES),
      talents: pick(TALENTS),
      gear,
      buffs: { ...base.buffs, enabled: [...base.buffs.enabled.filter((id) => !CONSUMABLES.includes(id)), ...consumables] },
      rotation,
      fight: { ...base.fight, executePct: rnd() < 0.7 ? 20 : 0, creatureType: pick(CREATURES) },
      run: { mode: 'fixed', iterations: 100, seed: 1 },
    })
  }
  return out
}
