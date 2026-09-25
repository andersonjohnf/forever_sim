// A second, fixed set of warlock setups for fixed-cases.test.ts's regression guard (LB-4): what the
// random sets of apl-cases.ts never reach, since they keep the default gear and only take ranks off
// the default talents. Incinerate talented on each spec (and chosen or not), Demonic Brand at ranks
// 1–3 with each demon, and on-use trinkets worn: first a grid of named setups, then random ones
// around them. The plan each builds, whole, is fingerprinted. A seeded generator, so the cases and
// their snapshot are the same every run; not part of the app.
//
// The settings are drawn from a frozen description of the options as they were when the snapshot
// was taken (FROZEN), not from the live options, so a setting added later, or a choice that gains a
// value, can't change what's drawn (as hunter-apl-cases.ts does).
import { defaultConfig } from '../../defaults'
import type { RotationValue, SimConfig, SpecId } from '../../types'
import { type WarlockSpec, warlockIds } from './shared'

type Frozen = { id: string; kind: 'toggle' } | { id: string; kind: 'number'; min: number; max: number; step: number } | { id: string; kind: 'choice'; choices: readonly string[] }

export const SPEC_ID: Record<WarlockSpec, SpecId> = {
  destruction: 'warlock-destruction',
  affliction: 'warlock-affliction',
  demonology: 'warlock-demonology',
}

/** A spec's settings when the snapshot was taken, in its options' order then. */
export function frozenOptions(spec: WarlockSpec): Frozen[] {
  const ID = warlockIds(spec)
  const toggle = (id: string): Frozen => ({ id, kind: 'toggle' })
  const mana = (id: string): Frozen => ({ id, kind: 'number', min: 0, max: 5000, step: 50 })
  const sacrifice: Frozen = { id: ID.sacrifice, kind: 'choice', choices: ['imp', 'succubus', 'voidwalker', 'none'] }
  const bane: Frozen = { id: ID.bane, kind: 'choice', choices: ['agony', 'doom', 'none'] }
  const filler: Frozen = { id: ID.filler, kind: 'choice', choices: ['shadowBolt', 'incinerate'] }
  const lifeTap: Frozen = { id: ID.lifeTap, kind: 'number', min: 0, max: 100, step: 5 }
  const head = [toggle(ID.racial), toggle(ID.trinkets), toggle(ID.powerInfusion), toggle(ID.curse)]
  const tail = [lifeTap, toggle(ID.manaPotion), mana(ID.manaPotionMissing), toggle(ID.rune), mana(ID.runeMissing)]
  switch (spec) {
    case 'destruction':
      return [sacrifice, ...head, toggle(ID.immolate), toggle(ID.conflagrate), toggle(ID.shadowburn), toggle(ID.corruption), bane, filler, ...tail]
    case 'affliction':
      return [sacrifice, ...head, toggle(ID.corruption), bane, toggle(ID.siphonLife), filler, ...tail]
    case 'demonology':
      return [
        sacrifice,
        { id: ID.demon, kind: 'choice', choices: ['imp', 'succubus', 'felhunter', 'none'] },
        ...head,
        toggle(ID.immolate),
        toggle(ID.corruption),
        bane,
        toggle(ID.soulFire),
        toggle(ID.searingPain),
        filler,
        ...tail,
      ]
  }
}

/** Builds with Incinerate (warlock.md §6.4's measured ones; Destruction's default has it). */
export const INCINERATE_BUILD: Record<WarlockSpec, string> = {
  destruction: '25-0050203001-0050355103101351',
  affliction: '255500100002--0550315103101051',
  demonology: '-03050032011203-0550315103101051',
}
/** Demonology's brand build (warlock.md §11.6) at Demonic Brand 1, 2 and 3 (the Demonology tree's 14th talent). */
export const BRAND_BUILD = ['-0305003221020101351-0450305003', '-0305003221020201351-0450305003', '-0305003221020301351-0450305003']
/** The on-use trinkets the sim models (effects/items.ts): Earthstrike and the Weakness Analyzer. */
const ON_USE = [21180, 272438]
/** Races a warlock can be. */
const RACES = ['horde-orc', 'horde-undead', 'horde-troll', 'alliance-human', 'alliance-gnome']
/** Buffs switches the warlock's rotation reads: its consumables, Power Infusion and the curse it keeps up. */
const BUFFS = ['majorManaPotion', 'demonicRune', 'powerInfusion', 'curseOfTheElements']
const SEEDS: Record<WarlockSpec, number> = { destruction: 60611, affliction: 60612, demonology: 60613 }

/** A spec's default setup with these talents, settings and trinkets. */
function setup(spec: WarlockSpec, talents: string, rotation: Record<string, RotationValue> = {}, trinkets: number[] = []): SimConfig {
  const base = defaultConfig(SPEC_ID[spec])
  const gear = { ...base.gear }
  if (trinkets[0] !== undefined) gear.trinket1 = { itemId: trinkets[0] }
  if (trinkets[1] !== undefined) gear.trinket2 = { itemId: trinkets[1] }
  return { ...base, talents, gear, rotation }
}

/**
 * The named setups: on each spec Incinerate talented and chosen, and Shadow Bolt chosen over it
 * (Demonology's with Immolate off too); on Demonology Demonic Brand at 1, 2 and 3 with the Imp, the
 * Succubus and the Felhunter (the Imp's default sacrifice, the Succubus's for the others, which
 * Demonic Pact keeps), and at 3 with its row off; and on each spec both on-use trinkets worn, with
 * their row on and off.
 */
export function namedCases(): { name: string; config: SimConfig }[] {
  const out: { name: string; config: SimConfig }[] = []
  for (const spec of ['destruction', 'affliction', 'demonology'] as const) {
    const ID = warlockIds(spec)
    out.push({ name: `${spec}: Incinerate talented and chosen`, config: setup(spec, INCINERATE_BUILD[spec], { [ID.filler]: 'incinerate' }) })
    out.push({ name: `${spec}: Incinerate talented, Shadow Bolt chosen`, config: setup(spec, INCINERATE_BUILD[spec], { [ID.filler]: 'shadowBolt' }) })
    if (spec === 'demonology') out.push({ name: `${spec}: Incinerate without Immolate`, config: setup(spec, INCINERATE_BUILD[spec], { [ID.filler]: 'incinerate', [ID.immolate]: false }) })
    const talents = defaultConfig(SPEC_ID[spec]).talents
    out.push({ name: `${spec}: on-use trinkets, their row on`, config: setup(spec, talents, {}, ON_USE) })
    out.push({ name: `${spec}: on-use trinkets, their row off`, config: setup(spec, talents, { [ID.trinkets]: false }, ON_USE) })
  }
  const ID = warlockIds('demonology')
  for (let r = 0; r < 3; r++) {
    for (const demon of ['imp', 'succubus', 'felhunter']) {
      const sacrifice = demon === 'imp' ? 'succubus' : 'imp'
      out.push({ name: `demonology: Demonic Brand ${r + 1}/3 with the ${demon}`, config: setup('demonology', BRAND_BUILD[r], { [ID.demon]: demon, [ID.sacrifice]: sacrifice }) })
    }
  }
  out.push({ name: 'demonology: Demonic Brand 3/3, Searing Pain off', config: setup('demonology', BRAND_BUILD[2], { [ID.searingPain]: false }) })
  return out
}

/**
 * `count` random setups of a spec around those: about half the frozen settings set at random, one of
 * the spec's builds above (or its default) with random ranks taken off, the race, each on-use trinket
 * worn about a third of the time, the Buffs switches the rotation reads, the fight and the rules.
 */
export function randomCases(spec: WarlockSpec, count: number, seed = SEEDS[spec]): SimConfig[] {
  let state = seed
  // Math.imul keeps the product exact: a plain multiply loses bits past 2^53 and falls into short cycles.
  const rnd = () => (state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const base = defaultConfig(SPEC_ID[spec])
  const options = frozenOptions(spec)
  const builds = [base.talents, INCINERATE_BUILD[spec], ...(spec === 'demonology' ? BRAND_BUILD : [])]
  const out: SimConfig[] = []
  while (out.length < count) {
    const rotation: Record<string, RotationValue> = {}
    for (const o of options) {
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[o.id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[o.id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[o.id] = pick(o.choices)
    }
    const talents = pick(builds)
      .split('-')
      .map((tree) => [...tree].map((d) => (rnd() < 0.15 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join(''))
      .join('-')
    const gear = { ...base.gear }
    if (rnd() < 0.35) gear.trinket1 = { itemId: ON_USE[0] }
    if (rnd() < 0.35) gear.trinket2 = { itemId: ON_USE[1] }
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
