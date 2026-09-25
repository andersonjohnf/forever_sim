// Random warlock setups for the three specs' `<spec>-apl.test.ts` checks that the priority list
// (decision D31) plays each rotation exactly as the warlock played it before the list: the plan each
// setup builds, whole, is fingerprinted. A seeded generator, so the cases and their snapshot are the
// same every run; not part of the app.
import { defaultConfig } from '../../defaults'
import type { RotationOption, RotationValue, SimConfig, SpecId } from '../../types'
import { fingerprint, planJson } from '../warrior/fury-apl-cases'

export { fingerprint, planJson }

/** Races a warlock can be. */
const RACES = ['horde-orc', 'horde-undead', 'horde-troll', 'alliance-human', 'alliance-gnome']
/** Buffs switches the warlock's rotation reads: its consumables, Power Infusion and the curse it keeps up. */
const BUFFS = ['majorManaPotion', 'demonicRune', 'powerInfusion', 'curseOfTheElements']

/**
 * `count` setups from the spec's default: about half of `settings` set at random (listed in their
 * order before the list, so the random stream stays the same whatever settings come later), talents
 * with random ranks taken off in every tree, the race, the Buffs switches the rotation reads, the
 * fight and the rules. The first is the default setup.
 */
export function warlockCases(spec: SpecId, options: readonly RotationOption[], settings: readonly string[], count: number, seed: number): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const byId = new Map(options.map((o) => [o.id, o]))
  const base = defaultConfig(spec)
  const out: SimConfig[] = [base]
  while (out.length < count) {
    const rotation: Record<string, RotationValue> = {}
    for (const id of settings) {
      const o = byId.get(id)!
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[id] = pick(o.choices).value
    }
    const talents = base.talents
      .split('-')
      .map((tree) => [...tree].map((d) => (rnd() < 0.3 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join(''))
      .join('-')
    const enabled = BUFFS.reduce((on, id) => (rnd() < 0.4 ? (on.includes(id) ? on.filter((b) => b !== id) : [...on, id]) : on), base.buffs.enabled)
    out.push({
      ...base,
      race: pick(RACES),
      talents,
      buffs: { ...base.buffs, enabled },
      rotation,
      fight: { ...base.fight, durationSec: pick([30, 90, 180, 300]), executePct: rnd() < 0.3 ? 0 : base.fight.executePct },
      rules: { ...base.rules, profile: rnd() < 0.2 ? 'classicEra' : 'forever' },
    })
  }
  return out
}
