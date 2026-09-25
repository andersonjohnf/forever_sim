// Random Balance setups for balance-apl.test.ts's check that the priority list (decision D31) plays
// Balance's rotation exactly as it played before the list: the plan each setup builds, whole, is
// fingerprinted. A seeded generator, so the cases and their snapshot are the same every run; not part
// of the app.
import { defaultConfig } from '../../defaults'
import type { RotationOption, RotationValue, SimConfig } from '../../types'
import { fingerprint } from '../warrior/fury-apl-cases'

export { fingerprint }

/**
 * Balance's settings before the priority list, in their order then: the cases set them from this
 * list, so the random stream stays the same whatever settings come later.
 */
const SETTINGS_BEFORE = [
  'druid.balance.racial.enabled',
  'druid.balance.trinkets.enabled',
  'druid.balance.powerInfusion.enabled',
  'druid.balance.innervate.enabled',
  'druid.balance.innervate.maxManaPct',
  'druid.balance.faerieFire.enabled',
  'druid.balance.insectSwarm.enabled',
  'druid.balance.moonfire.enabled',
  'druid.balance.dots.minFightLeftSec',
  'druid.balance.eclipse.enabled',
  'druid.balance.filler.spell',
  'druid.balance.manaPotion.enabled',
  'druid.balance.manaPotion.missingMana',
  'druid.balance.rune.enabled',
  'druid.balance.rune.missingMana',
]

const RACES = ['horde-tauren', 'alliance-night-elf']
/** Buffs switches the rotation reads: its consumables, a priest's Power Infusion, and the Faerie Fire its own shares a group with. */
const BUFFS = ['majorManaPotion', 'demonicRune', 'powerInfusion', 'faerieFire']
/** The on-use trinkets the sim knows (effects/items.ts): Weakness Analyzer's crit is a spell's too. */
const ITEMS: [slot: keyof SimConfig['gear'], itemId: number][] = [
  ['trinket1', 21180],
  ['trinket2', 272438],
]

/**
 * `count` setups from the default Balance druid: about half the settings set at random (the case's
 * `rotation`, before the list), talents with random ranks taken off in every tree (Eclipse, Insect
 * Swarm, Moonglow and Nature's Grace among them), the race, the on-use trinkets, the Buffs switches
 * the rotation reads, the raid's priest, the fight and the rules. The first is the default.
 */
export function balanceCases(options: readonly RotationOption[], count: number, seed = 31115): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const byId = new Map(options.map((o) => [o.id, o]))
  const base = defaultConfig('druid-balance')
  const out: SimConfig[] = [base]
  while (out.length < count) {
    const rotation: Record<string, RotationValue> = {}
    for (const id of SETTINGS_BEFORE) {
      const o = byId.get(id)!
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[id] = pick(o.choices).value
    }
    const talents = base.talents
      .split('-')
      .map((tree) => [...tree].map((d) => (rnd() < 0.2 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join(''))
      .join('-')
    const gear = { ...base.gear }
    for (const [slot, itemId] of ITEMS) if (rnd() < 0.3) gear[slot] = { itemId }
    const enabled = BUFFS.reduce((on, id) => (rnd() < 0.4 ? (on.includes(id) ? on.filter((b) => b !== id) : [...on, id]) : on), base.buffs.enabled)
    const raid = rnd() < 0.3 ? base.buffs.raid.filter((c) => c !== 'priest') : base.buffs.raid
    out.push({
      ...base,
      race: pick(RACES),
      talents,
      gear,
      buffs: { raid, enabled },
      rotation,
      fight: { ...base.fight, durationSec: pick([30, 90, 180, 300]) },
      rules: { ...base.rules, profile: rnd() < 0.2 ? 'classicEra' : 'forever' },
    })
  }
  return out
}
