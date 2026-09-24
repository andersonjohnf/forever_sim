// Random Fury setups for fury-apl.test.ts's check that the default order gives the plan the
// rotation gave before the priority list (decision D31). A seeded generator, so the cases and their
// snapshot are the same every run; not part of the app.
import { JUJU_FLURRY, MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { ITEM_EFFECTS } from '../../effects/items'
import { CLASSIC_ERA, FOREVER } from '../../rules/profiles'
import type { RotationOption, RotationValue } from '../../types'
import type { RotationContext } from './shared'

const TALENT_NAMES = [
  'Death Wish',
  'Bloodthirst',
  'Improved Berserker Rage',
  'Improved Execute',
  'Improved Charge',
  'Improved Tactical Mastery',
  'Impale',
  'Improved Slam',
  'Boundless Rage',
  'Improved Heroic Strike',
  'Improved Bloodrage',
  'Raging Blows',
  'Flurry',
  'Improved Overpower',
  'Cruelty',
  'Unbridled Wrath',
  'Tactical Mastery',
  'Improved Battle Shout',
  'Booming Voice',
]
const RACES: string[] = ['horde-orc', 'horde-troll', 'alliance-night-elf', 'alliance-human', 'alliance-gnome']

export interface FuryCase {
  values: Record<string, RotationValue>
  talents: Map<string, number>
  context: Partial<RotationContext>
}

/** `count` setups: about half the settings set at random, random talents, race, on-use items, consumables, phase and rules. */
export function furyCases(options: readonly RotationOption[], count: number, seed = 12345): FuryCase[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const onUse = Object.values(ITEM_EFFECTS)
    .map((e) => e.use)
    .filter((u) => u !== undefined)
  const out: FuryCase[] = []
  for (let i = 0; i < count; i++) {
    const values: Record<string, RotationValue> = {}
    for (const o of options) {
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') values[o.id] = rnd() < 0.5
      else if (o.kind === 'number') values[o.id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else values[o.id] = pick(o.choices).value
    }
    const talents = new Map<string, number>()
    for (const t of TALENT_NAMES) if (rnd() < 0.6) talents.set(t, 1 + Math.floor(rnd() * 3))
    const context: Partial<RotationContext> = {
      race: pick(RACES),
      items: onUse.filter(() => rnd() < 0.15),
      consumables: [MIGHTY_RAGE_POTION, JUJU_FLURRY].filter(() => rnd() < 0.6),
      executePhase: rnd() < 0.7,
      profile: rnd() < 0.8 ? FOREVER : CLASSIC_ERA,
    }
    out.push({ values, talents, context })
  }
  return out
}

/** A 53-bit hash of a string (cyrb53), as 14 hex digits: a short fingerprint of a plan for a snapshot. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}
