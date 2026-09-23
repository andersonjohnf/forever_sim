// The Arms priority list and its settings (docs/classes/warrior.md §5.1, §5.3): the options and
// their defaults, defaults that follow the talents and the base stance (classes/options.ts), and
// the lines armsRotation builds for them.
import { describe, expect, it } from 'vitest'
import { MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { ITEM_EFFECTS } from '../../effects/items'
import { COND, STANCE } from '../../plan/types'
import { CLASSIC_ERA } from '../../rules/profiles'
import type { RotationValue } from '../../types'
import { talentRanksByName } from '..'
import { TALENT_DATA, defaultConfig } from '../../defaults'
import { resolveRotationValues } from '../options'
import { overpowerWindowProcs } from './abilities'
import { ARMS_OPTIONS, armsBaseStance, armsMaintainedBuffs, armsRotation } from './arms'

/** The default Arms build's talents by name (37/14/0, warrior.md §6.1). */
const TALENTS = talentRanksByName(TALENT_DATA.warrior, defaultConfig('warrior-arms').talents)
const noAura = () => -1
type Rot = ReturnType<typeof armsRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const linesOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id)
const at = (r: Rot, id: string) => r.abilities.findIndex((a) => a.id === id)
const inExec = { code: COND.executePhase, a: 1, b: 0 }
const notExec = { code: COND.executePhase, a: 0, b: 0 }
const minRage = (tenths: number) => ({ code: COND.minRage, a: tenths, b: 0 })
const maxRage = (tenths: number) => ({ code: COND.maxRage, a: tenths, b: 0 })
const safe = (mask: number, b = 1500) => ({ code: COND.gcdSafe, a: mask, b })
const berserker = { 'warrior.arms.baseStance': 'berserker' }
const without = (...names: string[]) => new Map([...TALENTS].filter(([n]) => !names.includes(n)))

describe('Arms rotation options (warrior.md §5.1, §5.3)', () => {
  it('declares valid, uniquely named settings', () => {
    const optionIds = ARMS_OPTIONS.map((o) => o.id)
    expect(new Set(optionIds).size).toBe(optionIds.length)
    for (const option of ARMS_OPTIONS) {
      // `warrior.arms.baseStance` is the spec's own setting; the rest belong to an ability or row.
      expect(option.id).toMatch(option.kind === 'choice' ? /^warrior\.arms\.[a-zA-Z]+$/ : /^warrior\.arms\.[a-zA-Z]+\.[a-zA-Z]+$/)
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.help.length).toBeGreaterThan(0)
      if (option.kind === 'number') {
        expect(option.min).toBeLessThanOrEqual(option.default)
        expect(option.default).toBeLessThanOrEqual(option.max)
        expect(option.step).toBeGreaterThan(0)
      }
      if (option.kind === 'choice') expect(option.choices.map((c) => c.value)).toContain(option.default)
      if (option.dependsOn !== undefined) expect(ARMS_OPTIONS.find((o) => o.id === option.dependsOn)?.kind, option.id).toBe('toggle')
      // A default that follows another setting reads one declared before it.
      if (option.kind === 'toggle')
        for (const w of option.defaultWhen ?? [])
          if ('option' in w) expect(optionIds.indexOf(w.option), option.id).toBeLessThan(optionIds.indexOf(option.id))
    }
  })

  it('lists the settings in priority order, the base stance first (§5.3 rows 0–14, 16–18)', () => {
    const rows = [...new Set(ARMS_OPTIONS.map((o) => o.id.split('.')[2]))]
    expect(rows).toEqual([
      'baseStance',
      'prepull', // 0
      'battleShout', // 1
      'rend', // 2
      'deathWish', // 16, whose line comes before row 3's
      ...['racial', 'trinkets', 'cooldowns'], // 3
      'recklessness', // 4
      'bloodrage', // 5
      'execute', // 6, 7
      'mortalStrike', // 8
      'overpower', // 9
      'slam', // 10
      'spearingStrike', // 11
      'whirlwind', // 12
      'heroicStrike', // 13
      'hamstring', // 14
      'ragePotion', // 17
      'jujuFlurry', // 18
    ])
  })

  it('uses the §5.3 defaults with the default build', () => {
    expect(resolveRotationValues(ARMS_OPTIONS, {}, TALENTS)).toMatchObject({
      'warrior.arms.baseStance': 'battle',
      'warrior.arms.prepull.battleShout': true,
      'warrior.arms.prepull.bloodrage': true,
      'warrior.arms.prepull.charge': false,
      'warrior.arms.battleShout.enabled': true,
      'warrior.arms.battleShout.refreshBelowSec': 3,
      'warrior.arms.rend.enabled': true,
      'warrior.arms.rend.refreshBelowSec': 1.5,
      'warrior.arms.deathWish.enabled': false,
      'warrior.arms.racial.enabled': true,
      'warrior.arms.trinkets.enabled': true,
      'warrior.arms.recklessness.enabled': true,
      'warrior.arms.recklessness.lastSec': 15,
      'warrior.arms.bloodrage.enabled': true,
      'warrior.arms.bloodrage.maxRage': 110,
      'warrior.arms.execute.enabled': true,
      'warrior.arms.execute.slamInExecute': true,
      'warrior.arms.execute.mortalStrikeInExecute': false,
      'warrior.arms.mortalStrike.enabled': true,
      'warrior.arms.overpower.enabled': true,
      'warrior.arms.slam.enabled': true,
      'warrior.arms.slam.reserve': 0,
      'warrior.arms.spearingStrike.enabled': true,
      'warrior.arms.spearingStrike.minRageOtherTargets': 50,
      'warrior.arms.whirlwind.enabled': false,
      'warrior.arms.whirlwind.maxRage': 30,
      'warrior.arms.heroicStrike.enabled': true,
      'warrior.arms.heroicStrike.minRage': 45,
      'warrior.arms.heroicStrike.unqueue': false,
      'warrior.arms.hamstring.enabled': false,
      'warrior.arms.hamstring.minRage': 60,
      'warrior.arms.ragePotion.enabled': true,
      'warrior.arms.ragePotion.maxRage': 55,
      'warrior.arms.jujuFlurry.enabled': true,
    })
  })

  it('follows the talents and the base stance for Rend, Death Wish, Overpower and Whirlwind; a saved value wins', () => {
    const value = (saved: Record<string, RotationValue>, talents = TALENTS) => resolveRotationValues(ARMS_OPTIONS, saved, talents)
    // Rend is on by default only with Bloodthrill (§5.3 row 2), and off in Berserker Stance.
    expect(value({}, without('Bloodthrill'))['warrior.arms.rend.enabled']).toBe(false)
    expect(value({ 'warrior.arms.rend.enabled': true }, without('Bloodthrill'))['warrior.arms.rend.enabled']).toBe(true)
    // Death Wish follows its talent (row 16).
    expect(value({}, new Map([...TALENTS, ['Death Wish', 1]]))['warrior.arms.deathWish.enabled']).toBe(true)
    // Berserker Stance turns Whirlwind on and Rend and Overpower off, unless they're set (§5.3 notes).
    expect(value(berserker)).toMatchObject({
      'warrior.arms.whirlwind.enabled': true,
      'warrior.arms.rend.enabled': false,
      'warrior.arms.overpower.enabled': false,
    })
    expect(value({ ...berserker, 'warrior.arms.overpower.enabled': true, 'warrior.arms.whirlwind.enabled': false })).toMatchObject({
      'warrior.arms.whirlwind.enabled': false,
      'warrior.arms.overpower.enabled': true,
    })
    expect(armsBaseStance({})).toBe('battle')
    expect(armsBaseStance(berserker)).toBe('berserker')
  })
})

describe('armsRotation (warrior.md §5.3)', () => {
  it('builds the default list in §5.3 order with the default build', () => {
    const r = armsRotation({}, TALENTS, noAura, { race: 'horde-orc', consumables: [MIGHTY_RAGE_POTION] })
    expect(ids(r)).toEqual([
      'battleShout', // 1
      'rend', // 2
      'bloodFury', // 3: on cooldown, with no Death Wish
      'recklessness', // 4
      'bloodrage', // 5
      'slam', // 6: in the execute phase
      'execute', // 7
      'mortalStrike', // 8
      ...['overpower', 'overpower', 'overpower'], // 9: Mortal Strike GCD-safe or rage for both, and in the phase
      'slam', // 10
      'spearingStrike', // 11
      'heroicStrike', // 13
      'mightyRagePotion', // 17
    ])
    // Rows 12 and 14 (the Whirlwind dance and Hamstring) are off by default; Sweeping Strikes (15) isn't simulated.
    for (const id of ['whirlwind', 'hamstring', 'sweepingStrikes', 'deathWish']) expect(ids(r)).not.toContain(id)
    expect(r.procs).toEqual(overpowerWindowProcs(TALENTS))
    expect(r.procs.map((p) => p.id)).toEqual(['overpowerDodge', 'bloodthrill'])
    expect(armsMaintainedBuffs({})).toEqual(['battleShout'])
    expect(armsMaintainedBuffs({ 'warrior.arms.battleShout.enabled': false })).toEqual([])
  })

  it('resolves the abilities with the default build: Improved Slam 2/2, Improved Rend 3/3, Improved Overpower 2/2, Impale 2/2', () => {
    const r = armsRotation({}, TALENTS, noAura)
    expect(r.abilities[at(r, 'slam')]).toMatchObject({ castMs: 1000, gcdMs: 1000, castStopsSwings: false, costTenths: 150 })
    expect(r.abilities[at(r, 'rend')].dotTickDamage).toBeCloseTo(21 * 1.35, 12)
    expect(r.abilities[at(r, 'overpower')].bonusCrit).toBe(50)
    expect(r.abilities[at(r, 'heroicStrike')].costTenths).toBe(120)
    for (const id of ['mortalStrike', 'slam', 'overpower', 'execute', 'rend']) expect(r.abilities[at(r, id)].critMultiplier, id).toBeCloseTo(2.2, 12)
  })

  it('row 2: Rend when missing or at ≤ refreshBelowSec left, in both phases; from Berserker Stance a dance at rage ≤ the swap’s cap', () => {
    const r = armsRotation({ 'warrior.arms.rend.refreshBelowSec': 3 }, TALENTS, noAura)
    const rend = at(r, 'rend')
    expect(linesOf(r, 'rend')).toEqual([{ ability: rend, conditions: [{ code: COND.abilityAuraRefresh, a: rend, b: 3000 }], unqueueBelowTenths: 0 }])
    const b = armsRotation({ ...berserker, 'warrior.arms.rend.enabled': true }, TALENTS, noAura)
    expect(linesOf(b, 'rend')).toEqual([
      { ability: at(b, 'rend'), conditions: [{ code: COND.abilityAuraRefresh, a: at(b, 'rend'), b: 1500 }, maxRage(250)], unqueueBelowTenths: 0, danceTo: STANCE.battle },
    ])
    expect(ids(armsRotation({}, without('Bloodthrill'), noAura))).not.toContain('rend')
  })

  it('row 4: from Battle Stance, Recklessness swaps to Berserker Stance and stays; in Berserker Stance it’s a plain line', () => {
    const r = armsRotation({ 'warrior.arms.recklessness.lastSec': 20 }, TALENTS, noAura)
    expect(linesOf(r, 'recklessness')).toEqual([
      { ability: at(r, 'recklessness'), conditions: [{ code: COND.timeLeftAtMost, a: 20000, b: 0 }], unqueueBelowTenths: 0, danceTo: STANCE.berserker, stay: true },
    ])
    const b = armsRotation(berserker, TALENTS, noAura)
    expect(linesOf(b, 'recklessness')).toEqual([{ ability: at(b, 'recklessness'), conditions: [{ code: COND.timeLeftAtMost, a: 15000, b: 0 }], unqueueBelowTenths: 0 }])
  })

  it('rows 6–8: Slam in the phase at rage ≥ its cost + Execute’s, Execute, then Mortal Strike outside it; optionally Mortal Strike in it', () => {
    const r = armsRotation({}, TALENTS, noAura)
    const slams = linesOf(r, 'slam').map((e) => e.conditions)
    expect(slams[0]).toEqual([inExec, minRage(300)])
    expect(linesOf(r, 'execute').map((e) => e.conditions)).toEqual([[]])
    expect(linesOf(r, 'mortalStrike').map((e) => e.conditions)).toEqual([[notExec]])
    const ms = armsRotation({ 'warrior.arms.execute.mortalStrikeInExecute': true }, TALENTS, noAura)
    expect(ids(ms).slice(ids(ms).indexOf('slam'), ids(ms).indexOf('execute') + 2)).toEqual(['slam', 'mortalStrike', 'execute', 'mortalStrike'])
    expect(linesOf(ms, 'mortalStrike').map((e) => e.conditions)).toEqual([[inExec], [notExec]])
    // Without Slam in the phase, or without Execute: no phase lines at all.
    expect(linesOf(armsRotation({ 'warrior.arms.execute.slamInExecute': false }, TALENTS, noAura), 'slam').map((e) => e.conditions[0])).toEqual([notExec])
    const noEx = armsRotation({ 'warrior.arms.execute.enabled': false }, TALENTS, noAura)
    expect(ids(noEx)).not.toContain('execute')
    expect(noEx.rotation.every((e) => e.conditions.every((c) => c.code !== COND.executePhase))).toBe(true)
    // Mortal Strike needs its talent.
    expect(ids(armsRotation({}, without('Mortal Strike'), noAura))).not.toContain('mortalStrike')
  })

  it('row 9: Overpower when Mortal Strike is GCD-safe or there’s rage for both (35), in both phases', () => {
    const r = armsRotation({}, TALENTS, noAura)
    const ms = at(r, 'mortalStrike')
    expect(linesOf(r, 'overpower').map((e) => e.conditions)).toEqual([
      [notExec, safe(1 << ms)],
      [notExec, minRage(350)],
      [inExec], // Mortal Strike isn't used in the phase
    ])
    const msIn = armsRotation({ 'warrior.arms.execute.mortalStrikeInExecute': true }, TALENTS, noAura)
    expect(linesOf(msIn, 'overpower').map((e) => e.conditions).slice(2)).toEqual([
      [inExec, safe(1 << at(msIn, 'mortalStrike'))],
      [inExec, minRage(350)],
    ])
    // From Berserker Stance: a dance at rage ≤ 25, which leaves no room for the rage-for-both line.
    const b = armsRotation({ ...berserker, 'warrior.arms.overpower.enabled': true }, TALENTS, noAura)
    const lines = linesOf(b, 'overpower')
    expect(lines.map((e) => e.danceTo)).toEqual([STANCE.battle, STANCE.battle])
    expect(lines.map((e) => e.conditions)).toEqual([
      [notExec, safe(1 << at(b, 'mortalStrike')), maxRage(250)],
      [inExec, maxRage(250)],
    ])
    // Off: no line and no window openers.
    const off = armsRotation({ 'warrior.arms.overpower.enabled': false }, TALENTS, noAura)
    expect(ids(off)).not.toContain('overpower')
    expect(off.procs).toEqual([])
  })

  it('row 10: Slam at rage ≥ 15 + reserve, Mortal Strike GCD-safe over Slam’s own 1 s GCD', () => {
    const r = armsRotation({ 'warrior.arms.slam.reserve': 10 }, TALENTS, noAura)
    expect(linesOf(r, 'slam').map((e) => e.conditions)[1]).toEqual([notExec, minRage(250), safe(1 << at(r, 'mortalStrike'), 1000)])
    // Without Improved Slam, its GCD is 1.5 s.
    const plain = armsRotation({}, without('Improved Slam'), noAura)
    expect(linesOf(plain, 'slam').map((e) => e.conditions)[1]).toEqual([notExec, minRage(150), safe(1 << at(plain, 'mortalStrike'), 1500)])
  })

  it('row 11: Spearing Strike on cooldown against Giants and Dragonkin, otherwise at rage ≥ 50 with Mortal Strike GCD-safe', () => {
    const vs = (creatureType: 'giant' | 'dragonkin' | 'none' | 'beast') => {
      const r = armsRotation({}, TALENTS, noAura, { creatureType })
      return { conditions: linesOf(r, 'spearingStrike').map((e) => e.conditions), ms: at(r, 'mortalStrike') }
    }
    expect(vs('giant').conditions).toEqual([[notExec]])
    expect(vs('dragonkin').conditions).toEqual([[notExec]])
    for (const t of ['none', 'beast'] as const) expect(vs(t).conditions).toEqual([[notExec, minRage(500), safe(1 << vs(t).ms)]])
    expect(ids(armsRotation({}, without('Spearing Strike'), noAura))).not.toContain('spearingStrike')
  })

  it('row 12: the Whirlwind dance from Battle Stance at rage ≤ maxRage; in Berserker Stance, no dance', () => {
    const r = armsRotation({ 'warrior.arms.whirlwind.enabled': true }, TALENTS, noAura)
    expect(ids(r).slice(ids(r).indexOf('spearingStrike') + 1, ids(r).indexOf('heroicStrike'))).toEqual(['whirlwind'])
    expect(linesOf(r, 'whirlwind')).toEqual([
      { ability: at(r, 'whirlwind'), conditions: [notExec, safe(1 << at(r, 'mortalStrike')), maxRage(300)], unqueueBelowTenths: 0, danceTo: STANCE.berserker },
    ])
    const b = armsRotation(berserker, TALENTS, noAura)
    expect(linesOf(b, 'whirlwind')).toEqual([{ ability: at(b, 'whirlwind'), conditions: [notExec, safe(1 << at(b, 'mortalStrike'))], unqueueBelowTenths: 0 }])
    // Berserker Stance's defaults: Whirlwind, and no Rend, Overpower or window openers.
    for (const id of ['rend', 'overpower']) expect(ids(b)).not.toContain(id)
    expect(b.procs).toEqual([])
    // No Raging Blows in the Arms build, so no off-hand strike (a two-hander anyway).
    expect(b.abilities[at(b, 'whirlwind')].offHand).toBe(false)
  })

  it('rows 13 and 14: Heroic Strike at 45 outside the phase; Hamstring at 60, GCD-safe for every ability above it with a cooldown', () => {
    const r = armsRotation({ 'warrior.arms.hamstring.enabled': true, 'warrior.arms.whirlwind.enabled': true, 'warrior.arms.heroicStrike.unqueue': true }, TALENTS, noAura)
    expect(linesOf(r, 'heroicStrike')).toEqual([{ ability: at(r, 'heroicStrike'), conditions: [notExec, minRage(450)], unqueueBelowTenths: 200 }])
    const mask = (1 << at(r, 'mortalStrike')) | (1 << at(r, 'slam')) | (1 << at(r, 'spearingStrike')) | (1 << at(r, 'whirlwind'))
    expect(linesOf(r, 'hamstring').map((e) => e.conditions)).toEqual([[notExec, minRage(600), safe(mask)]])
    expect(ids(r).at(-1)).toBe('hamstring')
  })

  it('row 16: with the talent, Death Wish before the racial, which waits for it as Fury’s does', () => {
    const talents = new Map([...TALENTS, ['Death Wish', 1]])
    const r = armsRotation({}, talents, noAura, { race: 'horde-orc' })
    expect(ids(r).slice(0, 7)).toEqual(['battleShout', 'rend', 'deathWish', 'deathWish', 'bloodFury', 'bloodFury', 'bloodFury'])
    expect(linesOf(r, 'bloodFury')[0].conditions).toEqual([{ code: COND.abilityAuraUp, a: at(r, 'deathWish'), b: 0 }])
    // On-use trinkets too.
    const analyzer = ITEM_EFFECTS[272438].use!
    expect(ids(armsRotation({}, TALENTS, noAura, { items: [analyzer] }))).toContain(analyzer.id)
  })

  it('row 0: Battle Shout and Bloodrage before the pull; Charge keeps all its rage in Battle Stance, and swaps with the cap in Berserker', () => {
    const r = armsRotation({ 'warrior.arms.prepull.charge': true }, TALENTS, noAura)
    expect(r.prepull).toEqual({
      casts: [
        { ability: at(r, 'battleShout'), atMs: -3000 },
        { ability: at(r, 'bloodrage'), atMs: -1000 },
      ],
      chargeTenths: 150,
      keepTenths: -1,
    })
    const b = armsRotation({ ...berserker, 'warrior.arms.prepull.charge': true }, new Map([...TALENTS, ['Improved Charge', 2]]), noAura)
    expect(b.prepull).toMatchObject({ chargeTenths: 210, keepTenths: 250 })
    expect(armsRotation({ ...berserker, 'warrior.arms.prepull.charge': true }, TALENTS, noAura, { profile: CLASSIC_ERA }).prepull.keepTenths).toBe(250)
  })
})
