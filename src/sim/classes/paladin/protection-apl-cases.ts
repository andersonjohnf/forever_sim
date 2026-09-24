// Random Protection paladin setups for protection-apl.test.ts's check that the Defensive and Max
// TPS presets give the plans the rotation gave before the priority list (decisions D28, D31). A
// seeded generator, so the cases and their snapshot are the same every run; not part of the app.
import { defaultConfig } from '../../defaults'
import type { RotationOption, RotationValue, SimConfig } from '../../types'

/** Talent builds: the default, the popular one, T2's, and one short of Holy Shield, Swift Judgement and Iron Creed. */
const TALENTS = ['-0530513321301551-50215', '2-4530513321301551-502', '2-4530013321301551-50205', '-0530513321301-50215']
const RACES = ['alliance-human', 'alliance-dwarf', 'horde-undead', 'horde-tauren']
/** Main hands: the Flurry Axe (the default), Ironfoe (a mace), the Ravenholdt Slicer (a sword), and the Arcanite Reaper (a two-hander, no shield). */
const MAIN_HANDS = [871, 11684, 22378, 12784]
const TWO_HANDER = 12784
const CREATURES = ['none', 'undead', 'demon', 'beast'] as const
/** Consumables the rotation presses, on or off in Buffs. */
const CONSUMABLES = ['majorManaPotion', 'demonicRune', 'jujuFlurry']
/** Worn in place of the default trinkets, sometimes: the two on-use trinkets the rotation presses. */
const ON_USE = [272438, 21180]

/**
 * `count` configs: about half the rotation's settings set at random, and the priority always set
 * (Defensive's `duties` or Max TPS's `maxTps`, the two rotations before Balanced); talents, race,
 * main hand, a shield or not, trinkets, consumables, execute phase, creature type and the JotC and
 * Hammer of the Righteous rules at random.
 */
export function protectionCases(options: readonly RotationOption[], priorityId: string, count: number, seed = 20260924): SimConfig[] {
  let state = seed
  const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const base = defaultConfig('paladin-protection')
  const out: SimConfig[] = []
  for (let i = 0; i < count; i++) {
    const rotation: Record<string, RotationValue> = {}
    for (const o of options) {
      if (o.id === priorityId || rnd() < 0.5) continue
      if (o.kind === 'toggle') rotation[o.id] = rnd() < 0.5
      else if (o.kind === 'number') rotation[o.id] = Math.round((o.min + rnd() * (o.max - o.min)) / o.step) * o.step
      else rotation[o.id] = pick(o.choices).value
    }
    rotation[priorityId] = rnd() < 0.5 ? 'duties' : 'maxTps'
    const mainHand = pick(MAIN_HANDS)
    const gear = { ...base.gear, mainHand: { itemId: mainHand } }
    if (mainHand === TWO_HANDER || rnd() < 0.1) delete gear.offHand
    if (rnd() < 0.3) gear.trinket1 = { itemId: pick(ON_USE) }
    const consumables = CONSUMABLES.filter(() => rnd() < 0.5)
    out.push({
      ...base,
      race: pick(RACES),
      talents: pick(TALENTS),
      gear,
      buffs: { ...base.buffs, enabled: [...base.buffs.enabled.filter((id) => !CONSUMABLES.includes(id)), ...consumables] },
      rotation,
      fight: { ...base.fight, executePct: rnd() < 0.7 ? 20 : 0, creatureType: pick(CREATURES) },
      rules: { ...base.rules, jotcBonus: rnd() < 0.7 ? 'coefficient' : 'flat', hotrWeaponDps: rnd() < 0.7 ? 'withAttackPower' : 'weaponOnly' },
      run: { mode: 'fixed', iterations: 100, seed: 1 },
    })
  }
  return out
}
