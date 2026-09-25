// Random rogue setups for the priority lists' checks (decision D31, `<spec>-apl.test.ts`) that the
// list in its default order plays each spec's rotation exactly as the rogue played it before the
// list: the plan each setup builds, whole, is fingerprinted. A seeded generator, so the cases and
// their snapshot are the same every run; not part of the app. This file holds the generator and the
// list's shape check the three specs share, and Combat's settings.
import { expect } from 'vitest'
import { defaultConfig } from '../../defaults'
import type { AplDefinition, RotationOption, RotationValue, SimConfig, SpecId } from '../../types'
import { fingerprint, planJson } from '../warrior/fury-apl-cases'

export { fingerprint, planJson }

/**
 * Combat's settings before the priority list, in their order then: the cases set them from this
 * list, so the random stream stays the same whatever settings come later.
 */
export const COMBAT_SETTINGS_BEFORE = [
  'rogue.combat.racial.enabled',
  'rogue.combat.onUseItems.enabled',
  'rogue.combat.bladeFlurry.enabled',
  'rogue.combat.adrenalineRush.enabled',
  'rogue.combat.sliceAndDice.enabled',
  'rogue.combat.sliceAndDice.minComboPoints',
  'rogue.combat.sliceAndDice.refreshBelowSec',
  'rogue.combat.exposeArmor.enabled',
  'rogue.combat.rupture.enabled',
  'rogue.combat.rupture.minComboPoints',
  'rogue.combat.rupture.minFightLeftSec',
  'rogue.combat.eviscerate.enabled',
  'rogue.combat.eviscerate.minComboPoints',
  'rogue.combat.thistleTea.enabled',
  'rogue.combat.thistleTea.maxEnergy',
  'rogue.combat.jujuFlurry.enabled',
]

/** The races these cases cover: every race a rogue can be but Skyborne, whose base stats are only a placeholder. */
const RACES = ['horde-orc', 'horde-undead', 'horde-troll', 'alliance-human', 'alliance-dwarf', 'alliance-night-elf', 'alliance-gnome']
/** Buffs switches the rotations read, or that decide what they use: the consumables, the armor debuffs and the poisons. */
const BUFFS = ['thistleTea', 'jujuFlurry', 'exposeArmor', 'sunderArmor', 'deadlyPoisonMainHand', 'instantPoisonOffHand']
/**
 * Items the rotations read: Earthstrike and Weakness Analyzer (on use), and a dagger or a sword in
 * each hand (Mutilate, Backstab, Ambush, Hemorrhage and Ghostly Strike read the weapon types).
 */
const ITEMS: [slot: keyof SimConfig['gear'], itemIds: number[]][] = [
  ['trinket1', [21180]],
  ['trinket2', [272438]],
  ['mainHand', [12590, 12940]],
  ['offHand', [14555, 12939]],
]

/**
 * `count` setups from the spec's default: about half of `settings` set at random (before the list),
 * talents with random ranks taken off, the race, the items, the Buffs switches the rotation reads, the
 * fight (its length, execute phase and your position) and the rules. The first is the default setup.
 */
export function rogueCases(spec: SpecId, options: readonly RotationOption[], settings: readonly string[], count: number, seed: number): SimConfig[] {
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
      .map((tree) => [...tree].map((d) => (rnd() < 0.25 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join(''))
      .join('-')
    const gear = { ...base.gear }
    for (const [slot, itemIds] of ITEMS) if (rnd() < 0.35) gear[slot] = { ...gear[slot], itemId: pick(itemIds) }
    const enabled = BUFFS.reduce((on, id) => (rnd() < 0.4 ? (on.includes(id) ? on.filter((b) => b !== id) : [...on, id]) : on), base.buffs.enabled)
    out.push({
      ...base,
      race: pick(RACES),
      talents,
      gear,
      buffs: { ...base.buffs, enabled },
      rotation,
      fight: {
        ...base.fight,
        durationSec: pick([30, 90, 180, 300]),
        executePct: rnd() < 0.3 ? 0 : base.fight.executePct,
        position: rnd() < 0.25 ? 'front' : 'behind',
      },
      rules: { ...base.rules, profile: rnd() < 0.2 ? 'classicEra' : 'forever' },
    })
  }
  return out
}

/**
 * The list's shape, for each spec's test: every setting has one place, a row or spec-wide; each row's
 * switch is a toggle, its summary names only its own settings, its id is unique, and nothing is
 * pinned (a rogue has no pre-pull); a row without a switch says what it does.
 */
export function expectRowsCoverOptions(apl: AplDefinition, options: readonly RotationOption[]): void {
  const known = new Set(options.map((o) => o.id))
  const placed = [...apl.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...apl.specWide]
  expect([...known].filter((id) => !placed.includes(id))).toEqual([])
  expect(placed.filter((id) => !known.has(id))).toEqual([])
  expect(new Set(placed).size).toBe(placed.length)
  for (const row of apl.rows) {
    if (row.enabledId) expect(options.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
    else expect(row.help, row.id).toBeDefined()
    for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    expect(row.pinned, row.id).toBeUndefined()
  }
  expect(new Set(apl.rows.map((r) => r.id)).size).toBe(apl.rows.length)
  expect(apl.presets).toEqual([])
}

/** Combat's cases. */
export const combatCases = (options: readonly RotationOption[], count: number, seed = 31101) => rogueCases('rogue-combat', options, COMBAT_SETTINGS_BEFORE, count, seed)
