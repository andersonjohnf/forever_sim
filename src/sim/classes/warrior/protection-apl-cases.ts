// Random Protection setups for protection-apl.test.ts's check that the Defensive and Max TPS
// presets give the plans the rotation gave before the priority list (decisions D28, D31). A seeded
// generator, so the cases and their snapshot are the same every run; not part of the app.
//
// The settings are drawn from a frozen description of the options as they were before the list
// (PRE_LIST_OPTIONS), not from PROTECTION_OPTIONS, so a setting added later, or a choice that gains
// a value (Balanced), can't change what's drawn.
import { JUJU_FLURRY, MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { ITEM_EFFECTS } from '../../effects/items'
import { CLASSIC_ERA, FOREVER } from '../../rules/profiles'
import type { RuleProfileId, RotationValue } from '../../types'
import { fingerprint } from './fury-apl-cases'
import type { RotationContext } from './shared'

export { fingerprint }

type Frozen = { id: string; kind: 'toggle' } | { id: string; kind: 'number'; min: number; max: number; step: number } | { id: string; kind: 'choice'; choices: readonly string[] }

const P = 'warrior.protection'
const toggle = (id: string): Frozen => ({ id: `${P}.${id}`, kind: 'toggle' })
const number = (id: string, min: number, max: number, step: number): Frozen => ({ id: `${P}.${id}`, kind: 'number', min, max, step })

/** Protection's settings before the priority list (ee171d2a), in PROTECTION_OPTIONS' order then. */
export const PRE_LIST_OPTIONS: readonly Frozen[] = [
  { id: `${P}.priority`, kind: 'choice', choices: ['duties', 'maxTps'] },
  toggle('prepull.battleShout'),
  toggle('prepull.bloodrage'),
  toggle('prepull.charge'),
  toggle('shieldBlock.enabled'),
  number('shieldBlock.minRage', 0, 130, 1),
  toggle('bloodrage.enabled'),
  number('bloodrage.maxRage', 0, 130, 1),
  toggle('battleShout.enabled'),
  number('battleShout.refreshBelowSec', 0, 30, 1),
  toggle('racial.enabled'),
  toggle('trinkets.enabled'),
  toggle('thunderClap.enabled'),
  toggle('thunderClap.maintainOnly'),
  number('thunderClap.refreshBelowSec', 0, 30, 0.5),
  toggle('demoShout.enabled'),
  number('demoShout.refreshBelowSec', 0, 30, 0.5),
  toggle('shieldSlam.enabled'),
  number('shieldSlam.minRage', 0, 130, 1),
  toggle('revenge.enabled'),
  toggle('sunder.enabled'),
  number('sunder.refreshBelowSec', 0, 30, 0.5),
  toggle('sunderFiller.enabled'),
  number('sunderFiller.minRage', 0, 130, 1),
  toggle('sunderFiller.waitForShieldSlam'),
  toggle('heroicStrike.enabled'),
  number('heroicStrike.minRage', 0, 130, 1),
  toggle('heroicStrike.unqueue'),
  number('heroicStrike.unqueueBelow', 0, 130, 1),
  number('heroicStrike.anyRageLastSec', 0, 60, 1),
  toggle('execute.enabled'),
  toggle('ragePotion.enabled'),
  number('ragePotion.maxRage', 0, 130, 1),
  toggle('jujuFlurry.enabled'),
]

const TALENT_NAMES = [
  'Shield Slam',
  'Vanguard',
  'Improved Revenge',
  'Improved Bloodrage',
  'Improved Tactical Mastery',
  'Improved Charge',
  'Improved Sunder Armor',
  'Focused Rage',
  'Improved Heroic Strike',
  'Improved Thunder Clap',
  'Boundless Rage',
  'Improved Execute',
  'Impale',
]
const RACES: string[] = ['horde-orc', 'horde-troll', 'horde-tauren', 'alliance-night-elf', 'alliance-human', 'alliance-dwarf', 'alliance-gnome']

export interface ProtectionCase {
  values: Record<string, RotationValue>
  talents: Map<string, number>
  context: Partial<RotationContext>
  /** The same setup for a whole config (buildPlan): its race, execute phase, rules and consumables. */
  race: string
  executePct: number
  profile: RuleProfileId
  consumables: string[]
}

/** `count` setups: about half the settings set at random, random talents, race, on-use items, consumables, phase and rules. */
export function protectionCases(count: number, seed = 24680): ProtectionCase[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const onUse = Object.values(ITEM_EFFECTS)
    .map((e) => e.use)
    .filter((u) => u !== undefined)
  const out: ProtectionCase[] = []
  for (let i = 0; i < count; i++) {
    const values: Record<string, RotationValue> = {}
    for (const o of PRE_LIST_OPTIONS) {
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') values[o.id] = rnd() < 0.5
      else if (o.kind === 'number') values[o.id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else values[o.id] = pick(o.choices)
    }
    const talents = new Map<string, number>()
    for (const t of TALENT_NAMES) if (rnd() < 0.6) talents.set(t, 1 + Math.floor(rnd() * 3))
    const consumables = [MIGHTY_RAGE_POTION, JUJU_FLURRY].filter(() => rnd() < 0.6)
    const executePhase = rnd() < 0.7
    const classic = rnd() >= 0.8
    const race = pick(RACES)
    const context: Partial<RotationContext> = {
      race,
      items: onUse.filter(() => rnd() < 0.15),
      consumables,
      executePhase,
      profile: classic ? CLASSIC_ERA : FOREVER,
    }
    out.push({
      values,
      talents,
      context,
      race,
      executePct: executePhase ? 20 : 0,
      profile: classic ? 'classicEra' : 'forever',
      consumables: consumables.map((c) => c.id),
    })
  }
  return out
}
