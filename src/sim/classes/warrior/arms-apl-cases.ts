// Random Arms setups for arms-apl.test.ts's check that the default order gives the plan the rotation
// gave before the priority list (decision D31): the plan each setup builds, whole, is fingerprinted.
// A seeded generator, so the cases and their snapshot are the same every run; not part of the app.
import { defaultConfig } from '../../defaults'
import type { RotationOption, RotationValue, SimConfig } from '../../types'
import { fingerprint } from './fury-apl-cases'

export { fingerprint }

/**
 * Arms' settings before the priority list, in ARMS_OPTIONS' order then: the cases set them from this
 * list, so the random stream stays the same whatever settings come later.
 */
const P = 'warrior.arms'
const SETTINGS_BEFORE = [
  'baseStance',
  'prepull.battleShout',
  'prepull.bloodrage',
  'prepull.charge',
  'battleShout.enabled',
  'battleShout.refreshBelowSec',
  'rend.enabled',
  'rend.refreshBelowSec',
  'deathWish.enabled',
  'deathWish.alignToEnd',
  'racial.enabled',
  'trinkets.enabled',
  'cooldowns.syncWithDeathWish',
  'recklessness.enabled',
  'recklessness.beforeExecuteSec',
  'recklessness.lastSec',
  'bloodrage.enabled',
  'bloodrage.maxRage',
  'execute.enabled',
  'execute.slamInExecute',
  'execute.mortalStrikeInExecute',
  'mortalStrike.enabled',
  'overpower.enabled',
  'slam.enabled',
  'slam.reserve',
  'spearingStrike.enabled',
  'spearingStrike.minRageOtherTargets',
  'whirlwind.enabled',
  'whirlwind.maxRage',
  'heroicStrike.enabled',
  'heroicStrike.minRage',
  'heroicStrike.unqueue',
  'heroicStrike.unqueueBelow',
  'hamstring.enabled',
  'hamstring.minRage',
  'ragePotion.enabled',
  'ragePotion.maxRage',
  'jujuFlurry.enabled',
].map((id) => `${P}.${id}`)

/** Every race with a racial cooldown the rotation presses, a Gnome's Eureka!, and two without. */
const RACES = ['horde-orc', 'horde-troll', 'alliance-night-elf', 'alliance-gnome', 'alliance-human', 'horde-undead']
/** The Fury tree: the default's, or Fury's own (Death Wish, Flurry, Improved Execute, Improved Berserker Rage). */
const FURY_TREES = ['05050103', '050530035150010051']
/** The Buffs switches the rotation reads: its consumables, and the Battle Shout its own replaces. */
const BUFFS = ['mightyRagePotion', 'jujuFlurry', 'battleShout']
/** Earthstrike and Weakness Analyzer, the on-use trinkets the rotation presses (§5.3 row 3). */
const TRINKETS: [slot: 'trinket1' | 'trinket2', itemId: number][] = [
  ['trinket1', 21180],
  ['trinket2', 272438],
]

/**
 * `count` setups from the default Arms warrior: about half the settings set at random, talents with
 * random ranks taken off (and Fury's tree for Death Wish), the race, the on-use trinkets, a two-hander
 * or Fury's two one-handers (Spearing Strike needs the two-hander), the consumables and Battle Shout
 * in Buffs, the fight (length, execute phase, Giants and Dragonkin for Spearing Strike) and the rules.
 * The first is the default setup.
 */
export function armsCases(options: readonly RotationOption[], count: number, seed = 51207): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const byId = new Map(options.map((o) => [o.id, o]))
  const base = defaultConfig('warrior-arms')
  const fury = defaultConfig('warrior-fury')
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
    const arms = base.talents.split('-')[0]
    const talents = [[...arms].map((d) => (rnd() < 0.3 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join(''), pick(FURY_TREES), ''].join('-')
    const gear = { ...base.gear }
    for (const [slot, itemId] of TRINKETS) if (rnd() < 0.3) gear[slot] = { itemId }
    if (rnd() < 0.25) {
      gear.mainHand = fury.gear.mainHand
      gear.offHand = fury.gear.offHand
    }
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
        creatureType: pick(['none', 'none', 'giant', 'dragonkin', 'undead'] as const),
      },
      rules: { ...base.rules, profile: rnd() < 0.2 ? 'classicEra' : 'forever' },
    })
  }
  return out
}
