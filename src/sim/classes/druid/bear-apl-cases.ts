// Random Feral bear setups for bear-apl.test.ts's check that the priority list (decision D31) plays
// the Defensive and Max TPS rotations exactly as the bear played them before it: the plan each setup
// builds, whole, is fingerprinted. A seeded generator, so the cases and their snapshot are the same
// every run; not part of the app.
import { defaultConfig } from '../../defaults'
import type { RotationOption, RotationValue, SimConfig } from '../../types'
import { fingerprint } from '../warrior/fury-apl-cases'

export { fingerprint }

/**
 * The bear's settings before the priority list, in their order then: the cases set them from this
 * list, so the random stream stays the same whatever settings come later. The priority was a choice
 * of two, "Tank duties first" (`duties`, the default then) and Max TPS (`maxTps`).
 */
const SETTINGS_BEFORE = [
  'druid.bear.priority',
  'druid.bear.berserk.enabled',
  'druid.bear.enrage.prepull',
  'druid.bear.enrage.inCombat',
  'druid.bear.enrage.maxRage',
  'druid.bear.racial.enabled',
  'druid.bear.onUseItems.enabled',
  'druid.bear.faerieFire.enabled',
  'druid.bear.faerieFire.refreshBelowSec',
  'druid.bear.demoRoar.enabled',
  'druid.bear.demoRoar.refreshBelowSec',
  'druid.bear.maul.enabled',
  'druid.bear.maul.minRage',
  'druid.bear.mangle.enabled',
  'druid.bear.lacerate.enabled',
  'druid.bear.lacerate.onlyWithoutOtherBleeds',
  'druid.bear.lacerate.refreshBelowSec',
  'druid.bear.swipe.enabled',
  'druid.bear.swipe.minRage',
  'druid.bear.faerieFire.filler',
  'druid.bear.ragePotion.enabled',
  'druid.bear.ragePotion.maxRage',
  'druid.bear.jujuFlurry.enabled',
]
const PRIORITIES_BEFORE = ['duties', 'maxTps']

const RACES = ['horde-tauren', 'alliance-night-elf']
/** Buffs switches the bear's rotation reads: its consumables, and the debuffs its own share groups with. */
const BUFFS = ['mightyRagePotion', 'jujuFlurry', 'demoralizingShout', 'demoralizingRoar', 'faerieFire']
/** Wolfshead Helm, Idol of Brutality, Earthstrike, Weakness Analyzer and the Manual Crowd Pummeler (druid.md §4.1, §7.3). */
const ITEMS: [slot: keyof SimConfig['gear'], itemId: number][] = [
  ['head', 8345],
  ['ranged', 23198],
  ['trinket1', 21180],
  ['trinket2', 272438],
  ['mainHand', 9449],
]

/**
 * `count` setups from the default bear: about half the settings set at random (the case's
 * `rotation`, before the list), talents with random Feral ranks taken off, the race, the items the
 * rotation reads, the Buffs switches it reads, the raid's warriors, the fight and the rules. The first
 * two are the defaults then, and Max TPS with nothing else set.
 */
export function bearCases(options: readonly RotationOption[], count: number, seed = 31028): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const byId = new Map(options.map((o) => [o.id, o]))
  const base = defaultConfig('druid-feral-bear')
  const out: SimConfig[] = [base, { ...base, rotation: { 'druid.bear.priority': 'maxTps' } }]
  while (out.length < count) {
    const rotation: Record<string, RotationValue> = {}
    for (const id of SETTINGS_BEFORE) {
      const o = byId.get(id)!
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[id] = pick(PRIORITIES_BEFORE)
    }
    const [balance, feral, resto] = base.talents.split('-')
    const talents = [balance, [...feral].map((d) => (rnd() < 0.3 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join(''), resto].join('-')
    const gear = { ...base.gear }
    for (const [slot, itemId] of ITEMS) if (rnd() < 0.3) gear[slot] = { itemId }
    const enabled = BUFFS.reduce((on, id) => (rnd() < 0.4 ? (on.includes(id) ? on.filter((b) => b !== id) : [...on, id]) : on), base.buffs.enabled)
    const raid = rnd() < 0.3 ? base.buffs.raid.filter((c) => c !== 'warrior') : base.buffs.raid
    out.push({
      ...base,
      race: pick(RACES),
      talents,
      gear,
      buffs: { raid, enabled },
      rotation,
      fight: { ...base.fight, durationSec: pick([30, 90, 180, 300]), executePct: rnd() < 0.3 ? 0 : base.fight.executePct },
      rules: { ...base.rules, profile: rnd() < 0.2 ? 'classicEra' : 'forever' },
    })
  }
  return out
}
