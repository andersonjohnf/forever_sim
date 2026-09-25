// Random shaman setups for the priority-list checks (decision D31): enhancement-apl.test.ts and
// elemental-apl.test.ts fingerprint the plan each builds, whole, on the code before the list, so the
// list in its default order must give each the same plan byte for byte. A seeded generator, so the
// cases and their snapshots are the same every run; not part of the app.
import { defaultConfig } from '../../defaults'
import type { RotationOption, RotationValue, SimConfig, SpecId } from '../../types'
import { fingerprint, planJson } from '../warrior/fury-apl-cases'

export { fingerprint, planJson }

/** The races a shaman can be (src/data/races/races.json). */
const RACES = ['horde-orc', 'horde-troll', 'horde-tauren', 'horde-skyborne-windshaper', 'alliance-dwarf']

export interface ShamanCaseSpace {
  spec: SpecId
  /**
   * The spec's settings before the priority list, in their order then: the cases set them from this
   * list, so the random stream stays the same whatever settings come later.
   */
  settings: readonly string[]
  /** Buffs switches the rotation reads: its consumables and the raid's cooldowns it presses. */
  buffs: readonly string[]
  /** Items the rotation reads, by slot: relics and on-use trinkets. */
  items: readonly (readonly [slot: keyof SimConfig['gear'], itemId: number])[]
}

/**
 * `count` setups from the spec's default: about half the settings set at random (the case's
 * `rotation`, before the list), talents with random ranks taken off in every tree, the race, the
 * items the rotation reads, the Buffs switches it reads, the fight and the rules. The first is the
 * default setup.
 */
export function shamanCases(space: ShamanCaseSpace, options: readonly RotationOption[], count: number, seed: number): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const byId = new Map(options.map((o) => [o.id, o]))
  const base = defaultConfig(space.spec)
  const out: SimConfig[] = [base]
  while (out.length < count) {
    const rotation: Record<string, RotationValue> = {}
    for (const id of space.settings) {
      const o = byId.get(id)!
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[id] = pick(o.choices).value
    }
    const talents = base.talents
      .split('-')
      .map((tree) => [...tree].map((d) => (rnd() < 0.25 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join(''))
      .join('-')
    const gear = { ...base.gear }
    for (const [slot, itemId] of space.items) if (rnd() < 0.3) gear[slot] = { itemId }
    const enabled = space.buffs.reduce((on, id) => (rnd() < 0.4 ? (on.includes(id) ? on.filter((b) => b !== id) : [...on, id]) : on), base.buffs.enabled)
    out.push({
      ...base,
      race: pick(RACES),
      talents,
      gear,
      buffs: { ...base.buffs, enabled },
      rotation,
      fight: { ...base.fight, durationSec: pick([30, 90, 180, 300]) },
      rules: { ...base.rules, profile: rnd() < 0.2 ? 'classicEra' : 'forever' },
    })
  }
  return out
}

/** The Enhancement settings before the priority list, in their order then. */
export const ENHANCEMENT_SETTINGS_BEFORE = [
  'shaman.enhancement.imbue',
  'shaman.enhancement.racial.enabled',
  'shaman.enhancement.rageOfTheFarseer.enabled',
  'shaman.enhancement.trinkets.enabled',
  'shaman.enhancement.jujuFlurry.enabled',
  'shaman.enhancement.stormstrike.enabled',
  'shaman.enhancement.lightningBolt.enabled',
  'shaman.enhancement.lightningBolt.minStacks',
  'shaman.enhancement.shock.spell',
  'shaman.enhancement.shock.minManaPct',
  'shaman.enhancement.manaPotion.enabled',
  'shaman.enhancement.manaPotion.missingMana',
  'shaman.enhancement.rune.enabled',
  'shaman.enhancement.rune.missingMana',
]

/**
 * Random Enhancement setups: its consumables and Windfury Totem in Buffs; Totem of Rage or Totem of
 * the Storm, Earthstrike and Weakness Analyzer (shaman.md "Enhancement priority").
 */
export const enhancementCases = (options: readonly RotationOption[], count: number, seed = 31071) =>
  shamanCases(
    {
      spec: 'shaman-enhancement',
      settings: ENHANCEMENT_SETTINGS_BEFORE,
      buffs: ['jujuFlurry', 'majorManaPotion', 'demonicRune', 'majorFrenzyPotion', 'windfuryTotem'],
      items: [
        ['ranged', 23199],
        ['trinket1', 272438],
        ['trinket2', 21180],
      ],
    },
    options,
    count,
    seed,
  )
