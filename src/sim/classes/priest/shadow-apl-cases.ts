// Random Shadow Priest setups for shadow-apl.test.ts's check that the priority list (decision D31),
// in its default order, gives the plan the rotation gave before it: the plan each setup builds, whole,
// is fingerprinted. A seeded generator, so the cases and their snapshot are the same every run; not
// part of the app.
import { defaultConfig } from '../../defaults'
import type { RotationOption, RotationValue, SimConfig } from '../../types'
import { fingerprint, planJson } from '../warrior/fury-apl-cases'

export { fingerprint, planJson }

/**
 * Shadow's settings before the priority list, in their order then: the cases set them from this
 * list, so the random stream stays the same whatever settings come later.
 */
const SETTINGS_BEFORE = [
  'priest.shadow.racial.enabled',
  'priest.shadow.trinkets.enabled',
  'priest.shadow.powerInfusion.enabled',
  'priest.shadow.innerFocus.enabled',
  'priest.shadow.shadowWordPain.enabled',
  'priest.shadow.devouringPlague.enabled',
  'priest.shadow.dots.minTimeLeftSec',
  'priest.shadow.mindBlast.enabled',
  'priest.shadow.starshards.enabled',
  'priest.shadow.vampiricEmbrace.enabled',
  'priest.shadow.mindFlay.enabled',
  'priest.shadow.mindFlay.ticks',
  'priest.shadow.manaPotion.enabled',
  'priest.shadow.manaPotion.missingMana',
  'priest.shadow.rune.enabled',
  'priest.shadow.rune.missingMana',
  'priest.shadow.darkSacrifice.enabled',
  'priest.shadow.darkSacrifice.missingMana',
]

/** Every race a Forever priest can be: the Troll's Berserking, the Night Elf's Starshards and Elune's Light, the Undead's Dark Sacrifice, the Gnome's Eureka!. */
const RACES = ['horde-troll', 'horde-undead', 'alliance-night-elf', 'alliance-human', 'alliance-dwarf', 'alliance-gnome']
/** Buffs switches the Shadow rotation reads: its mana consumables and another priest's Power Infusion. */
const BUFFS = ['majorManaPotion', 'demonicRune', 'powerInfusion']
/** On-use items the sim models (effects/items.ts), which the trinkets row presses: Earthstrike, Weakness Analyzer and the Manual Crowd Pummeler (a mace). */
const ITEMS: [slot: keyof SimConfig['gear'], itemId: number][] = [
  ['trinket1', 21180],
  ['trinket2', 272438],
  ['mainHand', 9449],
]

/**
 * `count` setups from the default Shadow Priest: about half the settings set at random (the case's
 * `rotation`, before the list), talents with random Discipline and Shadow ranks taken off, the race,
 * the on-use items, the Buffs switches the rotation reads, the fight's length and the rules. The
 * first is the default setup.
 */
export function shadowCases(options: readonly RotationOption[], count: number, seed = 31065): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const byId = new Map(options.map((o) => [o.id, o]))
  const base = defaultConfig('priest-shadow')
  const out: SimConfig[] = [base]
  const lower = (tree: string) => [...tree].map((d) => (rnd() < 0.25 ? String(Math.floor(rnd() * (Number(d) + 1))) : d)).join('')
  while (out.length < count) {
    const rotation: Record<string, RotationValue> = {}
    for (const id of SETTINGS_BEFORE) {
      const o = byId.get(id)!
      if (rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[id] = pick(o.choices).value
    }
    const [discipline, holy, shadow] = base.talents.split('-')
    const talents = [lower(discipline), holy, lower(shadow)].join('-')
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
      fight: { ...base.fight, durationSec: pick([30, 90, 180, 300]) },
      rules: { ...base.rules, profile: rnd() < 0.2 ? 'classicEra' : 'forever' },
    })
  }
  return out
}
