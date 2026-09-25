// Random Fire, Frost and Arcane mage setups for mage-apl.test.ts's check that the priority list
// (decision D31) plays each spec's default order exactly as the mage played it before the list: the
// plan each setup builds, whole, is fingerprinted. A seeded generator, so the cases and their
// snapshot are the same every run; not part of the app.
import { defaultConfig, defaultTalents } from '../../defaults'
import type { RotationOption, RotationValue, SimConfig } from '../../types'
import { fingerprint, planJson } from '../warrior/fury-apl-cases'

export { fingerprint, planJson }

export type MageSpecId = 'mage-fire' | 'mage-frost' | 'mage-arcane'

/**
 * Each spec's settings before the priority list, in their order then: the cases set them from this
 * list, so the random stream stays the same whatever settings come later.
 */
const SETTINGS_BEFORE: Record<MageSpecId, readonly string[]> = {
  'mage-fire': [
    'mage.fire.combustion.enabled',
    'mage.fire.racial.enabled',
    'mage.fire.trinkets.enabled',
    'mage.fire.powerInfusion.enabled',
    'mage.fire.evocation.enabled',
    'mage.fire.evocation.maxManaPct',
    'mage.fire.scorch.enabled',
    'mage.fire.scorch.refreshSec',
    'mage.fire.pyroblast.enabled',
    'mage.fire.pyroblast.minStacks',
    'mage.fire.fireBlast.enabled',
    'mage.fire.manaGems.enabled',
    'mage.fire.manaPotion.enabled',
    'mage.fire.manaPotion.missingMana',
    'mage.fire.rune.enabled',
    'mage.fire.rune.missingMana',
  ],
  'mage-frost': [
    'mage.frost.presenceOfMind.enabled',
    'mage.frost.racial.enabled',
    'mage.frost.trinkets.enabled',
    'mage.frost.powerInfusion.enabled',
    'mage.frost.evocation.enabled',
    'mage.frost.evocation.maxManaPct',
    'mage.frost.iceBarrier.enabled',
    'mage.frost.manaGems.enabled',
    'mage.frost.manaPotion.enabled',
    'mage.frost.manaPotion.missingMana',
    'mage.frost.rune.enabled',
    'mage.frost.rune.missingMana',
  ],
  'mage-arcane': [
    'mage.arcane.arcanePower.enabled',
    'mage.arcane.presenceOfMind.enabled',
    'mage.arcane.racial.enabled',
    'mage.arcane.trinkets.enabled',
    'mage.arcane.powerInfusion.enabled',
    'mage.arcane.evocation.enabled',
    'mage.arcane.evocation.maxManaPct',
    'mage.arcane.manaGems.enabled',
    'mage.arcane.manaPotion.enabled',
    'mage.arcane.manaPotion.missingMana',
    'mage.arcane.rune.enabled',
    'mage.arcane.rune.missingMana',
  ],
}

/** The mage's races (races.json): Troll's Berserking, Orc's Blood Fury, Gnome's Eureka!, and two without a racial cooldown the sim uses. */
const RACES = ['horde-troll', 'horde-orc', 'horde-undead', 'alliance-gnome', 'alliance-human']
/** Buffs switches the mage's rotations read: Power Infusion and the mana consumables. */
const BUFFS = ['powerInfusion', 'majorManaPotion', 'demonicRune']
/** On-use trinkets: Earthstrike and the Weakness Analyzer (effects/items.ts). */
const ITEMS: [slot: keyof SimConfig['gear'], itemId: number][] = [
  ['trinket1', 21180],
  ['trinket2', 272438],
]
/** The three default builds: a spec's rotation reads another's talents when it has them (Presence of Mind and Pyroblast in Arcane, Ice Barrier in Frost). */
const BUILDS = [defaultTalents('mage-fire'), defaultTalents('mage-frost'), defaultTalents('mage-arcane')]

/**
 * `count` setups from the spec's default: about half the settings set at random (the case's
 * `rotation`, before the list), talents (the spec's default build, or now and then another spec's)
 * with random ranks taken off, the race, on-use trinkets, the Buffs switches the rotation reads, the
 * fight and the rules. The first is the default.
 */
export function mageCases(spec: MageSpecId, options: readonly RotationOption[], count: number, seed = 31031): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const byId = new Map(options.map((o) => [o.id, o]))
  const base = defaultConfig(spec)
  const out: SimConfig[] = [base]
  while (out.length < count) {
    const rotation: Record<string, RotationValue> = {}
    for (const id of SETTINGS_BEFORE[spec]) {
      const o = byId.get(id)!
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
    }
    const build = rnd() < 0.3 ? pick(BUILDS) : base.talents
    const talents = build
      .split('-')
      .map((tree) => [...tree].map((d) => (rnd() < 0.2 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join(''))
      .join('-')
    const gear = { ...base.gear }
    for (const [slot, itemId] of ITEMS) if (rnd() < 0.3) gear[slot] = { itemId }
    const enabled = BUFFS.reduce((on, id) => (rnd() < 0.4 ? (on.includes(id) ? on.filter((b) => b !== id) : [...on, id]) : on), base.buffs.enabled)
    out.push({
      ...base,
      race: pick(RACES),
      talents,
      gear,
      buffs: { ...base.buffs, enabled },
      rotation,
      fight: { ...base.fight, durationSec: pick([30, 90, 180, 300]), executePct: rnd() < 0.3 ? 0 : base.fight.executePct },
      rules: { ...base.rules, profile: rnd() < 0.2 ? 'classicEra' : 'forever' },
    })
  }
  return out
}
