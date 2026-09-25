// Random hunter setups for hunter-apl.test.ts's check that the priority list (decision D31) plays
// each hunter spec's rotation exactly as it played before the list: the plan each setup builds,
// whole, is fingerprinted. A seeded generator, so the cases and their snapshot are the same every
// run; not part of the app.
//
// The settings are drawn from a frozen description of the options as they were when the snapshot
// was taken (PRE_LIST_OPTIONS), not from hunterOptions, so a setting added later, or a choice that
// gains a value, can't change what's drawn (as the paladin's protection-apl-cases.ts does).
import { defaultConfig } from '../../defaults'
import type { RotationValue, SimConfig } from '../../types'
import { fingerprint, planJson } from '../warrior/fury-apl-cases'
import type { HunterSpec } from './rotation'

export { fingerprint, planJson }

type Frozen = { id: string; kind: 'toggle' } | { id: string; kind: 'number'; min: number; max: number; step: number } | { id: string; kind: 'choice'; choices: readonly string[] }

const KEY: Record<HunterSpec, string> = {
  'hunter-marksmanship': 'marksmanship',
  'hunter-beast-mastery': 'beastMastery',
  'hunter-survival': 'survival',
}

/** A hunter spec's settings when the snapshot was taken (A2), in hunterOptions' order then. */
export function preListOptions(spec: HunterSpec): Frozen[] {
  const S = `hunter.${KEY[spec]}`
  const toggle = (id: string): Frozen => ({ id: `${S}.${id}`, kind: 'toggle' })
  const number = (id: string, min: number, max: number, step: number): Frozen => ({ id: `${S}.${id}`, kind: 'number', min, max, step })
  return [
    toggle('racial.enabled'),
    toggle('trinkets.enabled'),
    toggle('rapidFire.enabled'),
    toggle('bestialWrath.enabled'),
    toggle('huntersMark.enabled'),
    { id: `${S}.sharedCooldown.shot`, kind: 'choice', choices: ['aimed', 'multi', 'none'] },
    toggle('sharedCooldown.noClip'),
    toggle('arcaneShot.enabled'),
    toggle('serpentSting.enabled'),
    number('serpentSting.minTimeLeftSec', 0, 30, 1),
    toggle('sniperShot.enabled'),
    number('pet.clawFocus', 25, 100, 5),
    toggle('manaPotion.enabled'),
    number('manaPotion.missingMana', 0, 5000, 50),
    toggle('rune.enabled'),
    number('rune.missingMana', 0, 5000, 50),
  ]
}

/** The talent builds a case starts from: the three specs' defaults and Marksmanship with a pet (defaults.ts). */
const BUILDS = ['55-0053552511503051-', '5023-1053552501503051-', '5023001505011251-00505505-', '-00505515-55005003124000005']
/** Every race with a hunter racial cooldown the sim uses (Orc, Troll, Night Elf), and two without. */
const RACES = ['horde-orc', 'horde-troll', 'alliance-night-elf', 'alliance-dwarf', 'horde-tauren']
/** The mana consumables the rotation presses, on or off in Buffs. */
const CONSUMABLES = ['majorManaPotion', 'demonicRune']
/** The on-use trinkets the sim models (effects/items.ts): Earthstrike and the Weakness Analyzer. */
const ON_USE = [21180, 272438]
const SEEDS: Record<HunterSpec, number> = { 'hunter-marksmanship': 60101, 'hunter-beast-mastery': 60102, 'hunter-survival': 60103 }

/**
 * `count` setups of a hunter spec: the first its default; then about half the settings set at random,
 * a talent build (the spec's own half the time) with random ranks taken off (Lone Wolf, Bestial Wrath,
 * Sniper Shot and Trueshot Aura come and go), the race, on-use trinkets, the mana consumables, the
 * fight's length and creature type, and the rules.
 */
export function hunterCases(spec: HunterSpec, count: number, seed = SEEDS[spec]): SimConfig[] {
  let state = seed
  // Math.imul keeps the product exact: a plain multiply loses bits past 2^53 and falls into short cycles.
  const rnd = () => (state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const base = defaultConfig(spec)
  const options = preListOptions(spec)
  const out: SimConfig[] = [base]
  while (out.length < count) {
    const rotation: Record<string, RotationValue> = {}
    for (const o of options) {
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[o.id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[o.id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[o.id] = pick(o.choices)
    }
    const build = rnd() < 0.5 ? base.talents : pick(BUILDS)
    const talents = build
      .split('-')
      .map((tree) => [...tree].map((d) => (rnd() < 0.15 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join(''))
      .join('-')
    const gear = { ...base.gear }
    if (rnd() < 0.3) gear.trinket1 = { itemId: ON_USE[0] }
    if (rnd() < 0.3) gear.trinket2 = { itemId: ON_USE[1] }
    const consumables = CONSUMABLES.filter(() => rnd() < 0.6)
    out.push({
      ...base,
      race: pick(RACES),
      talents,
      gear,
      buffs: { ...base.buffs, enabled: [...base.buffs.enabled.filter((id) => !CONSUMABLES.includes(id)), ...consumables] },
      rotation,
      fight: { ...base.fight, durationSec: pick([30, 90, 180, 300]), creatureType: pick(['beast', 'humanoid', 'none'] as const) },
      rules: { ...base.rules, profile: rnd() < 0.2 ? 'classicEra' : 'forever' },
    })
  }
  return out
}
