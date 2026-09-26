// Random Protection paladin setups for protection-apl.test.ts's check that the Defensive and Max
// TPS presets give the plans the rotation gave before the priority list (decisions D28, D31). A
// seeded generator, so the cases and their snapshot are the same every run; not part of the app.
//
// The settings are drawn from a frozen description of the options as they were when the snapshot was
// taken (PRE_LIST_OPTIONS), not from PROTECTION_OPTIONS, so a setting added later, or a choice that
// gains a value, can't change what's drawn (as the warrior's protection-apl-cases.ts does).
import { defaultConfig } from '../../defaults'
import type { RotationValue, SimConfig } from '../../types'

type Frozen = { id: string; kind: 'toggle' } | { id: string; kind: 'number'; min: number; max: number; step: number } | { id: string; kind: 'choice'; choices: readonly string[] }

const toggle = (id: string): Frozen => ({ id, kind: 'toggle' })
const number = (id: string, min: number, max: number, step: number): Frozen => ({ id, kind: 'number', min, max, step })

/** The Priority choice, which every case sets itself, to Defensive or Max TPS. */
const PRIORITY = 'paladin.protection.priority'

/** The Protection paladin's settings when the snapshot was taken (A2), in PROTECTION_OPTIONS' order then. */
export const PRE_LIST_OPTIONS: readonly Frozen[] = [
  { id: 'paladin.protection.priority', kind: 'choice', choices: ['duties', 'balanced', 'maxTps'] },
  toggle('paladin.protection.devotionAura.enabled'),
  toggle('paladin.protection.judgementOfTheCrusader.enabled'),
  toggle('paladin.protection.holyShield.enabled'),
  toggle('paladin.protection.trinkets.enabled'),
  toggle('paladin.protection.jujuFlurry.enabled'),
  { id: 'paladin.protection.seal.primary', kind: 'choice', choices: ['fury', 'righteousness'] },
  number('paladin.protection.seal.refreshBelowSec', 0, 29, 0.5),
  toggle('paladin.protection.judgement.enabled'),
  toggle('paladin.protection.swiftJudgement.enabled'),
  number('paladin.protection.swiftJudgement.minCooldownSec', 0, 10, 0.5),
  toggle('paladin.protection.holyStrike.enabled'),
  toggle('paladin.protection.hammerOfTheRighteous.enabled'),
  toggle('paladin.protection.exorcism.enabled'),
  number('paladin.protection.exorcism.minManaPct', 0, 100, 5),
  toggle('paladin.protection.consecration.enabled'),
  number('paladin.protection.consecration.minManaPct', 0, 100, 5),
  toggle('paladin.protection.consecrationRank1.enabled'),
  number('paladin.protection.consecrationRank1.minManaPct', 0, 100, 5),
  toggle('paladin.protection.hammerOfWrath.enabled'),
  number('paladin.protection.hammerOfWrath.minManaPct', 0, 100, 5),
  toggle('paladin.protection.manaPotion.enabled'),
  number('paladin.protection.manaPotion.earlyMissingMana', 0, 5000, 50),
  number('paladin.protection.manaPotion.missingMana', 0, 5000, 50),
  toggle('paladin.protection.rune.enabled'),
  number('paladin.protection.rune.earlyMissingMana', 0, 5000, 50),
  number('paladin.protection.rune.missingMana', 0, 5000, 50),
]

/**
 * The list's order before the paladin review's PR-1 moved Consecration and Hammer of Wrath above Holy
 * Strike (and Exorcism with them): the rows as the rotation had them before the list, which each case
 * keeps, so a change of the default order isn't a change to what the old rotation played.
 */
export const PRE_LIST_ORDER: readonly string[] = [
  'prepull',
  'seal',
  'holyShield',
  'judgement',
  'swiftJudgement',
  'hammerOfTheRighteous',
  'holyStrike',
  'exorcism',
  'consecration',
  'consecrationRank1',
  'hammerOfWrath',
]

/** Talent builds: the default, the popular one, T2's, and one short of Holy Shield, Swift Judgement and Iron Creed. */
const TALENTS = ['-0530513321301551-50215', '2-4530513321301551-502', '2-4530013321301551-50205', '-0530513321301-50215']
const RACES = ['alliance-human', 'alliance-dwarf', 'horde-undead', 'horde-tauren']
/** Main hands: the Flurry Axe (the default), Ironfoe (a mace), the Ravenholdt Slicer (a sword), and the Arcanite Reaper (a two-hander, no shield). */
const MAIN_HANDS = [871, 11684, 22378, 12784]
const TWO_HANDER = 12784
const CREATURES = ['none', 'undead', 'demon', 'beast'] as const
/** Consumables the rotation presses, on or off in Buffs. */
const CONSUMABLES = ['majorManaPotion', 'demonicRune', 'jujuFlurry']
/** Worn in place of the default trinkets, sometimes: the two on-use trinkets the rotation presses. */
const ON_USE = [272438, 21180]

/**
 * `count` configs: about half the rotation's settings set at random, and the priority always set
 * (Defensive's `duties` or Max TPS's `maxTps`, the two rotations before Balanced); talents, race,
 * main hand, a shield or not, trinkets, consumables, execute phase, creature type and the JotC and
 * Hammer of the Righteous rules at random.
 */
export function protectionCases(count: number, seed = 20260924): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const base = defaultConfig('paladin-protection')
  const out: SimConfig[] = []
  for (let i = 0; i < count; i++) {
    const rotation: Record<string, RotationValue> = {}
    for (const o of PRE_LIST_OPTIONS) {
      if (o.id === PRIORITY || rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[o.id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[o.id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[o.id] = pick(o.choices)
    }
    rotation[PRIORITY] = rnd() < 0.5 ? 'duties' : 'maxTps'
    const mainHand = pick(MAIN_HANDS)
    const gear = { ...base.gear, mainHand: { itemId: mainHand } }
    if (mainHand === TWO_HANDER || rnd() < 0.1) delete gear.offHand
    if (rnd() < 0.3) gear.trinket1 = { itemId: pick(ON_USE) }
    const consumables = CONSUMABLES.filter(() => rnd() < 0.5)
    out.push({
      ...base,
      race: pick(RACES),
      talents: pick(TALENTS),
      gear,
      buffs: { ...base.buffs, enabled: [...base.buffs.enabled.filter((id) => !CONSUMABLES.includes(id)), ...consumables] },
      rotation,
      rotationOrder: [...PRE_LIST_ORDER],
      fight: { ...base.fight, executePct: rnd() < 0.7 ? 20 : 0, creatureType: pick(CREATURES) },
      rules: { ...base.rules, hotrWeaponDps: rnd() < 0.7 ? 'withAttackPower' : 'weaponOnly' },
      run: { mode: 'fixed', iterations: 100, seed: 1 },
    })
  }
  return out
}
