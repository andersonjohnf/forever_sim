// The hunter (docs/classes/hunter.md): its worked examples (§10), one test each, and what its plan
// makes of the defaults: the talents on the rows, the pet or Lone Wolf, the ammo and quiver, the
// sheet, the buffs a ranged spec can use, and the pet's procs on the pet's own random stream.
import { describe, expect, it } from 'vitest'
import { defaultConfig, DEFAULT_SUPPLIES } from '../../defaults'
import { BUFFS_BY_ID } from '../../effects/buffs'
import { buffUnusedReason, presetBuffIds } from '../../effects/presets'
import { FIELD_COUNT, Sim } from '../../engine/sim'
import { addShot, rangedPlan } from '../../engine/ranged-helpers'
import { damages, expectMean, line } from '../../engine/test-helpers'
import { buildPlan } from '../../plan/build'
import { PET_INHERITANCE } from '../../plan/pet'
import type { Plan } from '../../plan/types'
import { rotationValues } from '../../index'
import type { SimConfig } from '../../types'
import { HUNTER_BASE_MANA } from './abilities'
import { CAT_DAMAGE, HAPPY_DAMAGE } from './pet'
import { hunterIds, hunterUnusedSettings } from './rotation'
import { withCritBonus } from './talents'

const MM = 'hunter-marksmanship'
const BM = 'hunter-beast-mastery'
const SV = 'hunter-survival'
const plan = (config: SimConfig) => buildPlan(config).plan
const ability = (p: Plan, id: string) => {
  const a = p.abilities.find((x) => x.id === id)
  expect(a, id).toBeDefined()
  return a!
}
const spellOf = (p: Plan, id: string) => p.spells![ability(p, id).spell!]

describe('worked examples (docs/classes/hunter.md §10)', () => {
  it('WE-H1: Aimed Shot’s hit: 106.5 + 58.46 + 200 + 166 = 530.96 with Bloodseeker, Thorium arrows and 1,000 ranged attack power; ×1.10 with Barrage', () => {
    const average = (85 + 128) / 2 + 17.715 * 3.3 + (1000 / 14) * 2.8 + 166
    expect(average).toBeCloseTo(530.96, 2)
    const p = rangedPlan(60000, { min: 85, max: 128, speedSec: 3.3, flatDamage: 17.715 * 3.3 })
    p.stats.rap = 1000
    const shot = addShot(p, { flat: 166, normalized: true, cooldownMs: 3000 })
    line(p, shot)
    const row = p.abilities[shot].source
    expectMean(damages(p, row, 20), average)
    p.spells![p.abilities[shot].spell!].damageMult = 1.1
    expectMean(damages(p, row, 20), 584.06)
  })

  it('WE-H2: Mortal Shots 5/5: a shot’s crit ×2.3 and Serpent Sting’s tick crit ×1.65, on the default Marksmanship plan too', () => {
    expect(withCritBonus(2, 30)).toBeCloseTo(2.3, 12)
    expect(withCritBonus(1.5, 30)).toBeCloseTo(1.65, 12)
    const p = plan(defaultConfig(MM, 'horde-orc'))
    expect(spellOf(p, 'aimedShot').critMultiplier).toBeCloseTo(2.3, 12)
    expect(p.ranged!.critMultiplier).toBeCloseTo(2.3, 12)
    expect(spellOf(p, 'serpentSting').critMultiplier).toBeCloseTo(1.65, 12)
  })

  it('WE-H3: Efficiency 5/5: Aimed Shot 263, Multi-Shot 203, Arcane Shot 161, Serpent Sting 212; Hunter’s Mark and Sniper Shot stay', () => {
    const on = (id: string) => ({ [`hunter.marksmanship.${id}`]: true })
    const p = plan({ ...defaultConfig(MM), rotation: { ...on('arcaneShot.enabled'), ...on('sniperShot.enabled') } })
    const multi = plan({ ...defaultConfig(MM), rotation: { 'hunter.marksmanship.sharedCooldown.shot': 'multi' } })
    expect([263, 161, 212, 60, 365]).toEqual(['aimedShot', 'arcaneShot', 'serpentSting', 'huntersMark', 'sniperShot'].map((id) => ability(p, id).costTenths / 10))
    expect(ability(multi, 'multiShot').costTenths / 10).toBe(203)
  })

  it('WE-H4: Improved Stings 3/3: Serpent Sting’s tick 111 × 1.20 = 133.2', () => {
    const s = spellOf(plan(defaultConfig(MM)), 'serpentSting')
    expect(s.dotTickDamage! * s.dotDamageMult!).toBeCloseTo(133.2, 9)
  })

  it('WE-H5: a naked Orc hunter’s ranged attack power: 110 + 2 × 122 + 120 = 474; 536 with Careful Aim 5/5 (62 Intellect)', () => {
    const naked = (talents: string) =>
      buildPlan({ ...defaultConfig(MM, 'horde-orc'), talents, gear: {}, buffs: { raid: [], enabled: [] } }).sheet.ranged!.rangedAttackPower
    expect(naked('')).toBe(474)
    // Lethal Attacks 5 opens tier 2; Careful Aim 5/5 adds 100% of Intellect.
    expect(naked('-005005')).toBe(536)
  })

  it('WE-H6: Deadly Aspects 5/5 gives Quick Shots a 10% chance on an Auto Shot that lands: +30% ranged speed for 12 s', () => {
    const p = plan(defaultConfig(MM))
    const proc = p.procs.find((x) => x.id === 'quickShots')!
    expect(proc.chance[0]).toBeCloseTo(0.1, 12)
    expect(p.auras[proc.amount]).toMatchObject({ id: 'quickShots', durationMs: 12000, rangedHaste: 30 })
  })

  it('WE-H7: the Beast Mastery cat: ×1.10 × 1.25 × 1.15 × 1.02 = 1.612875 damage, 6 Focus a second, +10% crit', () => {
    const p = plan(defaultConfig(BM))
    expect(p.pet!.damageMult).toBeCloseTo(CAT_DAMAGE * HAPPY_DAMAGE * 1.15 * 1.02, 12)
    expect(p.pet!.damageMult).toBeCloseTo(1.612875, 9)
    expect(p.pet!.power).toMatchObject({ kind: 'focus', maxTenths: 1000, tickTenths: 60, tickMs: 1000 })
    expect(p.pet!.crit).toBeCloseTo(15, 9)
  })

  it('WE-H9: what the Beast Mastery cat inherits at the pull: 391 + 0.1 × 1,524 = 543.4 attack power, 15 + 23.20 = 38.20% crit, 35.80% on its specials against the boss, and your 6% hit: 8 − 6 = 2% miss', () => {
    const bundle = buildPlan(defaultConfig(BM))
    const p = bundle.plan
    expect(p.pet).toMatchObject({ ap: 391, auraCrit: 0, hit: 0, inherit: PET_INHERITANCE })
    expect(p.pet!.crit).toBeCloseTo(15, 9)
    const sheet = bundle.sheet
    expect([sheet.attackPower, sheet.ranged!.rangedAttackPower]).toEqual([1155, 1524])
    expect(sheet.ranged!.critPct).toBeCloseTo(23.2026, 9)
    // No casts or procs, so the fight ends with the stats it started with.
    const quiet: Plan = { ...p, rotation: [], procs: [], prepull: { ...p.prepull, casts: [] } }
    const sim = new Sim(quiet)
    sim.runFight(0)
    const s = sim as unknown as { petAp: number; petCritPct: number; petSpecCrit: number; derived: { hit: number }; rHitBonus: number; petThrWhite: Float64Array; petThrSpecial: Float64Array }
    // 10% of the higher of 1,155 and 1,524 (ranged-and-pets.md §6).
    expect(s.petAp).toBeCloseTo(543.4, 9)
    expect(s.petCritPct).toBeCloseTo(38.2026, 9)
    // Against a level-63 boss: −0.6 for its 300 skill, −1.8 because the inherited crit is aura crit (combat-tables §4.4).
    expect(s.petSpecCrit).toBeCloseTo(35.8026, 9)
    // Your higher hit, melee or ranged (6%: the same here), off its 8% miss against a level-63 boss, white and special.
    expect([s.derived.hit, s.rHitBonus]).toEqual([6, 0])
    expect([s.petThrWhite[0], s.petThrSpecial[0]]).toEqual([2, 2])
    // With 1,000 more melee attack power (2,155), the melee side is the higher one: 391 + 215.5.
    const stats = Object.assign(Object.create(Object.getPrototypeOf(p.stats) as object) as Plan['stats'], p.stats)
    stats.ap += 1000
    const melee = new Sim({ ...quiet, stats })
    melee.runFight(0)
    expect((melee as unknown as { petAp: number }).petAp).toBeCloseTo(606.5, 9)
  })

  it('its petInheritance text is every pet’s rule, worded for the cat: the higher of melee and ranged, the aura-crit loss, no spells', () => {
    const text = buildPlan(defaultConfig(BM)).assumptions.find((a) => a.id === 'petInheritance')!.text
    expect(text).toBe(
      'Your pet inherits 10% of your higher attack power and all of your higher crit and hit, melee or ranged, for its swings and specials. It counts the inherited crit as crit from auras, so against a raid boss its physical attacks lose 1.8% of that crit, as yours do. Forever’s pet scaling is server-side: this is Forever testers’ report for hunters’ pets (10% of the hunter’s attack power and all its crit), read for every stat and every pet. Untested.',
    )
    expect(buildPlan(defaultConfig(MM)).assumptions.some((a) => a.id === 'petInheritance')).toBe(false)
  })

  it('WE-H8: Rapid Fire with Rapid Killing 2/2 is 180 s; Arcane Shot with Improved Arcane Shot 5/5 is 4.5 s', () => {
    const p = plan({ ...defaultConfig(MM), rotation: { 'hunter.marksmanship.arcaneShot.enabled': true } })
    expect(ability(p, 'rapidFire').cooldownMs).toBe(180000)
    expect(ability(p, 'arcaneShot').cooldownMs).toBe(4500)
  })
})

describe('the default hunters’ plans', () => {
  it('shoot the ranged slot’s weapon with the ammo it fires and a 15% quiver or pouch, and swing nothing', () => {
    for (const spec of [MM, BM, SV] as const) {
      const config = defaultConfig(spec)
      const gun = config.gear.ranged!.itemId === 2099
      expect(config.gear.ammo?.itemId, spec).toBe(gun ? DEFAULT_SUPPLIES.bullets : DEFAULT_SUPPLIES.arrows)
      expect(config.gear.quiver?.itemId, spec).toBe(gun ? DEFAULT_SUPPLIES.pouch : DEFAULT_SUPPLIES.quiver)
      const { plan: p, blockers } = buildPlan(config)
      expect(blockers, spec).toEqual([])
      expect(p.weapons, spec).toEqual([null, null])
      expect(p.ranged!.hasteMult, spec).toBeCloseTo(1.15, 12)
      // Thorium: 17.715 a second × the weapon's speed, on every shot.
      expect(p.ranged!.flatDamage, spec).toBeCloseTo(17.715 * p.ranged!.speedSec, 9)
    }
  })

  it('adds no ammo damage for ammo the weapon doesn’t fire: arrows in a gun', () => {
    const config = defaultConfig(MM)
    expect(config.gear.ranged!.itemId).toBe(2099)
    const arrows = buildPlan({ ...config, gear: { ...config.gear, ammo: { itemId: DEFAULT_SUPPLIES.arrows } } })
    expect(arrows.plan.ranged!.flatDamage).toBe(0)
    expect(arrows.assumptions.find((a) => a.id === 'ammoNotFired')?.text).toMatch(/^Your ammo, Thorium Headed Arrow, isn’t what your ranged weapon fires/)
    expect(buildPlan(config).assumptions.some((a) => a.id === 'ammoNotFired')).toBe(false)
  })

  it('lists the resist assumption when Serpent Sting is used without Arcane Shot, and not with neither', () => {
    const ids = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)
    // Marksmanship's default: Serpent Sting on, Arcane Shot off.
    expect(ids(defaultConfig(MM))).toContain('arcaneShotResists')
    expect(ids({ ...defaultConfig(MM), rotation: { 'hunter.marksmanship.serpentSting.enabled': false } })).not.toContain('arcaneShotResists')
  })

  it('Lone Wolf: Marksmanship fights without a pet for +20% damage; Beast Mastery and Survival have a cat', () => {
    expect(plan(defaultConfig(MM)).pet).toBeUndefined()
    const withPet = plan({ ...defaultConfig(MM), talents: '5023-1053552501503051-' })
    expect(withPet.pet?.name).toBe('Cat')
    expect(plan(defaultConfig(MM)).damageMult / withPet.damageMult).toBeCloseTo(1.2 / 1.02, 9)
    for (const spec of [BM, SV] as const) expect(plan(defaultConfig(spec)).pet?.name, spec).toBe('Cat')
  })

  it('Bestial Wrath with the talent: +50% pet damage for 18 s, off the GCD; Frenzy a pet crit proc', () => {
    const p = plan(defaultConfig(BM))
    const bw = ability(p, 'bestialWrath')
    expect(bw.gcdMs).toBe(0)
    expect(p.auras[bw.aura]).toMatchObject({ durationMs: 18000, petDamage: 50 })
    expect(p.procs.find((x) => x.id === 'frenzy')?.chance[0]).toBeCloseTo(1, 12)
  })

  it('Aspect of the Hawk and Trueshot Aura are up from the pull: +120 and +50 ranged attack power on the sheet', () => {
    const base = { ...defaultConfig(MM, 'horde-orc'), gear: {}, buffs: { raid: [], enabled: [] } }
    // The default 10/41/0 against the same without Trueshot Aura (and Sniper Shot, which needs it).
    const withAura = buildPlan(base).sheet.ranged!.rangedAttackPower
    const without = buildPlan({ ...base, talents: '55-005355251050305-' }).sheet.ranged!.rangedAttackPower
    expect(withAura - without).toBe(50)
  })

  it('uses the first-pass defaults: Marksmanship Aimed Shot without Arcane Shot or Sniper Shot, Beast Mastery Multi-Shot, Survival Aimed Shot not waiting', () => {
    const v = (spec: typeof MM | typeof BM | typeof SV) => {
      const ID = hunterIds(spec)
      const values = rotationValues(defaultConfig(spec))
      return [values[ID.sharedShot], values[ID.noClip], values[ID.arcane], values[ID.sniper]]
    }
    expect(v(MM)).toEqual(['aimed', true, false, false])
    expect(v(BM)).toEqual(['multi', true, true, false])
    expect(v(SV)).toEqual(['aimed', false, false, false])
  })

  it('waits for Auto Shot with the shared cooldown’s shot: its line needs autoShotClear', () => {
    const p = plan(defaultConfig(MM))
    const aimed = p.abilities.findIndex((a) => a.id === 'aimedShot')
    expect(p.rotation.find((l) => l.ability === aimed)!.conditions.map((c) => c.code)).toContain(62)
  })

  it('dims “Wait for Auto Shot” only while the shared cooldown’s shot is Neither (hunter.md §8.3, docs/ux.md “Rotation”)', () => {
    for (const spec of [MM, BM, SV] as const) {
      const ID = hunterIds(spec)
      const values = rotationValues(defaultConfig(spec))
      const talents = new Map<string, number>()
      expect(hunterUnusedSettings(spec, values, talents)[ID.noClip], spec).toBeUndefined()
      for (const shot of ['aimed', 'multi']) expect(hunterUnusedSettings(spec, { ...values, [ID.sharedShot]: shot }, talents)[ID.noClip]).toBeUndefined()
      expect(hunterUnusedSettings(spec, { ...values, [ID.sharedShot]: 'none' }, talents)[ID.noClip]).toBe('Not used: at Neither there’s no shot to cast between Auto Shots.')
    }
  })

  it('shows a ranged sheet: ranged attack power, crit, hit, shot speed, weapon skill and ammo', () => {
    const r = buildPlan(defaultConfig(MM)).sheet.ranged!
    expect(r.rangedAttackPower).toBeGreaterThan(1000)
    expect(r.ammoDps).toBeCloseTo(17.715, 9)
    expect(r.weaponSkill).toBe(300)
    expect(r.speedSec).toBeCloseTo(2.9 / 1.15, 2)
    expect(buildPlan(defaultConfig(MM)).sheet.spell).toBeUndefined()
  })

  it('base mana 1,720', () => {
    expect(plan(defaultConfig(MM)).stats.baseMana).toBe(HUNTER_BASE_MANA)
  })
})

describe('the Buffs tab for a ranged spec', () => {
  it('locks off what a hunter’s shots can’t use: stones, Windfury Totem, Blessing of Might, Strength; keeps Battle Shout for the pet', () => {
    for (const id of ['denseSharpeningStone', 'elementalSharpeningStone', 'windfuryTotem', 'blessingOfMight', 'winterfallFirewater', 'jujuPower'])
      expect(buffUnusedReason(BUFFS_BY_ID.get(id)!, MM), id).toBeTruthy()
    for (const id of ['battleShout', 'graceOfAir', 'elixirOfTheMongoose', 'jujuMight', 'sunderArmor', 'arcaneBrilliance'])
      expect(buffUnusedReason(BUFFS_BY_ID.get(id)!, MM), id).toBeUndefined()
  })

  it('gives the hunters Grace of Air rather than Windfury Totem, the mana entries, and Juju Might’s ranged attack power', () => {
    const raid = presetBuffIds('raid', MM, defaultConfig(MM).buffs.raid)
    expect(raid).toContain('graceOfAir')
    expect(raid).not.toContain('windfuryTotem')
    expect(raid).toEqual(expect.arrayContaining(['arcaneBrilliance', 'blessingOfWisdom', 'majorManaPotion']))
    expect(presetBuffIds('raid', 'warrior-fury', defaultConfig(MM).buffs.raid)).toContain('windfuryTotem')
    const juju = buildPlan({ ...defaultConfig(MM), buffs: { raid: [], enabled: ['jujuMight'] } }).plan.stats.rap
    expect(juju - buildPlan({ ...defaultConfig(MM), buffs: { raid: [], enabled: [] } }).plan.stats.rap).toBe(40)
  })
})

describe('the pet’s procs roll on its own stream (docs/mechanics/ranged-and-pets.md §6)', () => {
  it('a partial-chance Frenzy (a petCrit proc) changes the pet’s rows but none of yours: it never draws from your proc stream', () => {
    const config = { ...defaultConfig(BM), run: { mode: 'fixed' as const, iterations: 50, seed: 3 } }
    const rows = (frenzyChance: number) => {
      const p = plan(config)
      const frenzy = p.procs.find((x) => x.id === 'frenzy')!
      frenzy.chance = [frenzyChance, 0]
      // Your own partial-chance proc on the proc stream: Deadly Aspects' Quick Shots.
      expect(p.procs.find((x) => x.id === 'quickShots')!.chance[0]).toBeLessThan(1)
      const sim = new Sim(p)
      for (let i = 0; i < 50; i++) sim.runFight(i)
      const pets = new Set(p.sources.flatMap((s, i) => (s.pet ? [i] : [])))
      const counters = Array.from(sim.counters)
      const perRow = (keep: (row: number) => boolean) => counters.filter((_, i) => keep(Math.floor(i / FIELD_COUNT)))
      return { yours: perRow((r) => !pets.has(r)), pet: perRow((r) => pets.has(r)), uptime: Array.from(sim.auraUpMs) }
    }
    const a = rows(0.6)
    const b = rows(0.2)
    expect(b.yours).toEqual(a.yours)
    expect(b.pet).not.toEqual(a.pet)
  })
})
