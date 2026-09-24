// The optimizer on the real engine, kept small enough for CI (docs/optimizer.md).
import { describe, expect, it } from 'vitest'
import { armorConstant, armorReduction } from '../core/formulas'
import { defaultConfig, TALENT_DATA } from '../defaults'
import { buildPlan } from '../plan/build'
import { PROFILES } from '../rules/profiles'
import type { SimConfig } from '../types'
import { defaultConstraints, effectiveHealth, formatConstraint, meetsSheet, parseConstraint, sheetValues } from './constraints'
import { describeBuildChange } from './describe'
import { localFightRunner } from './fights'
import { SURVIVAL_FLOOR } from './floor'
import { applyCandidate, confirm, firstRound, optimize } from './optimize'
import { screenTalents } from './screen'

const fixed = (config: SimConfig, seed = 1): SimConfig => ({ ...config, run: { mode: 'fixed', iterations: 0, seed } })

describe('screenTalents', () => {
  it('sorts the Protection warrior’s talents by what the sim measures', async () => {
    const config = fixed(defaultConfig('warrior-protection'))
    const screen = await screenTalents({ config, data: TALENT_DATA.warrior, runner: localFightRunner(), objective: 'balanced', fights: 40 })
    const role = (name: string) => screen.verdicts.find((v) => v.name === name)!
    // A talent the engine never reads leaves the plan alone: no fights needed to know.
    expect(role('Improved Hamstring')).toMatchObject({ role: 'none', planChanges: false })
    expect(role('Improved Shield Wall')).toMatchObject({ role: 'none', planChanges: false })
    // Toughness changes armor from items: damage taken, not threat (Forever's rage from hits is before mitigation).
    expect(role('Toughness')).toMatchObject({ role: 'survival', planChanges: true, scoreChanges: false, takenChanges: true })
    for (const name of ['Shield Slam', 'Defiance', 'Cruelty', 'Focused Rage']) expect(role(name).role).toBe('objective')
    expect(role('Defiance').effect!.mean).toBeGreaterThan(0)
    expect(screen.roles.size).toBe(screen.verdicts.length)
  })
})

describe('optimize', () => {
  // The bear's Feral talents with everything but a few kept: a space of a handful of builds.
  const bear = fixed(defaultConfig('druid-feral-bear'))
  const search = {
    minPoints: { 'Feral Combat': 31 },
    screenFights: 40,
  }

  it('races a small talent space to a leader, and does it the same way twice', async () => {
    const run = (capacity: number) =>
      optimize({ config: bear, talents: search, budget: { fights: 40_000, initialFights: 40 }, runner: localFightRunner(capacity), top: 5 })
    const a = await run(48)
    expect(a.objective).toBe('balanced')
    expect(a.space!.builds).toBeGreaterThan(10)
    expect(a.candidates[0].talents).toBe(bear.talents)
    // The survival floor is kept in every build (D30).
    const floor = Object.keys(SURVIVAL_FLOOR['druid-feral-bear']!)
    for (const c of a.candidates.slice(1)) {
      const changes = describeBuildChange(TALENT_DATA.druid, bear.talents, c.talents)
      for (const name of floor) expect(changes.some((x) => x.startsWith(`${name} `) && x.endsWith('→0'))).toBe(false)
    }
    expect(a.race.spent).toBeLessThanOrEqual(40_000)
    // Every reported result has its health and effective health (D30).
    for (const s of a.race.standings) expect(a.sheets[s.candidate].ehp).toBeGreaterThan(a.sheets[s.candidate].health)
    // Engines rebuilt at every job (a cache of 1) give the same race.
    const b = await run(1)
    expect(b.race.standings).toEqual(a.race.standings)
    expect(b.race.leader).toBe(a.race.leader)
  }, 60_000)

  it('searches the talents a constraint reads, and leaves out builds below the limit before any fight', async () => {
    const keepEhp = await optimize({
      config: bear,
      talents: { ...search, floor: false },
      constraints: [{ on: 'sheet', stat: 'ehp', min: 1, relative: true }],
      budget: { fights: 20_000, initialFights: 20 },
      runner: localFightRunner(),
    })
    // Without the floor Heart of the Wild is harmful (health costs a bear rage), but it changes
    // effective health, which the limit reads, so it's searched rather than never taken.
    const hotw = keepEhp.screen!.verdicts.find((v) => v.name === 'Heart of the Wild')!
    expect(hotw.role).toBe('harmful')
    expect(hotw.sheetStats).toContain('ehp')
    expect(keepEhp.space!.constrained).toContain(hotw.id)
    // Every build without it has less health than the default, so only builds with it race.
    expect(keepEhp.excluded).toBeGreaterThan(0)
    expect(keepEhp.candidates.length).toBeGreaterThan(1)
    for (const c of keepEhp.candidates.slice(1)) expect(describeBuildChange(TALENT_DATA.druid, bear.talents, c.talents)).not.toContain('Heart of the Wild 5→0')
    for (const s of keepEhp.race.standings) expect(keepEhp.sheets[s.candidate].ehp).toBeGreaterThanOrEqual(keepEhp.reference.ehp)
  }, 60_000)

  it('confirms a winner on a fresh seed against the baseline (D23)', async () => {
    const candidate = { talents: '050022-5520032023132210551-', rotation: {} }
    const check = await confirm({ config: bear, candidate, objective: 'balanced', seed: 99, fights: 300, runner: localFightRunner() })
    expect(check.fights).toBe(300)
    expect(check.vsBaseline.score.halfWidth).toBeGreaterThan(0)
    expect(check.clears).toBe(check.vsBaseline.score.mean - check.vsBaseline.score.halfWidth > 0)
  }, 60_000)

  it('sizes the first round from the budget', () => {
    expect(firstRound({ fights: 1_500_000 }, 7000)).toBe(64)
    expect(firstRound({ fights: 1_500_000 }, 10)).toBe(1000)
    expect(firstRound({ fights: 1_000 }, 7000)).toBe(50)
    expect(firstRound({ fights: 1_000, initialFights: 7 }, 7000)).toBe(7)
  })

  it('applies a candidate on top of the setup, at a fixed seed', () => {
    const c = applyCandidate(bear, { talents: '-5-', rotation: { x: 1 } }, 7)
    expect(c.talents).toBe('-5-')
    expect(c.rotation).toEqual({ ...bear.rotation, x: 1 })
    expect(c.run).toEqual({ mode: 'fixed', iterations: 0, seed: 7 })
  })
})

describe('constraints', () => {
  it('effective health is max health over the share armor lets through, against the boss’s level (D30)', () => {
    // Worked example: 10,000 armor against a level-63 boss: K = 400 + 85 × 63 = 5,755, so armor
    // stops 10,000 ÷ 15,755 = 63.47% and 8,000 health is 8,000 ÷ 0.36528 = 21,901 effective health.
    expect(armorConstant(63)).toBe(5755)
    expect(armorReduction(10_000, 63, PROFILES.forever)).toBeCloseTo(0.63472, 5)
    expect(8000 / (1 - armorReduction(10_000, 63, PROFILES.forever))).toBeCloseTo(21_901, 0)
    const bundle = buildPlan(fixed(defaultConfig('warrior-protection')))
    const ehp = effectiveHealth(bundle)
    expect(ehp).toBeCloseTo(bundle.sheet.health / (1 - armorReduction(bundle.plan.armor, 63, PROFILES.forever)), 6)
    expect(sheetValues(bundle).ehp).toBe(ehp)
  })

  it('parses and prints the command line’s limits', () => {
    expect(parseConstraint('ehp>=90%')).toEqual({ on: 'sheet', stat: 'ehp', min: 0.9, relative: true })
    expect(parseConstraint('taken <= 102%')).toEqual({ on: 'result', metric: 'taken', max: 1.02, relative: true })
    expect(parseConstraint('health>=8000')).toEqual({ on: 'sheet', stat: 'health', min: 8000 })
    expect(formatConstraint(parseConstraint('ehp>=90%'))).toBe('ehp>=90%')
    expect(() => parseConstraint('luck>=1')).toThrow(/isn't a sheet stat/)
    expect(() => parseConstraint('ehp=1')).toThrow(/name>=value/)
  })

  it('judges sheets against the reference, and a tank keeps 90% of its effective health by default', () => {
    const ref = sheetValues(buildPlan(fixed(defaultConfig('warrior-protection'))))
    const floor = defaultConstraints('tank')
    expect(meetsSheet({ ...ref, ehp: ref.ehp * 0.91 }, ref, floor)).toBe(true)
    expect(meetsSheet({ ...ref, ehp: ref.ehp * 0.89 }, ref, floor)).toBe(false)
    expect(defaultConstraints('dps')).toEqual([])
  })
})

describe('describeBuildChange', () => {
  it('lists the talents whose ranks differ, in code order', () => {
    expect(describeBuildChange(TALENT_DATA.warrior, '35-05-552101233301210531', '05-05-552131233301210531')).toEqual(['Improved Heroic Strike 3→0', 'Improved Thunder Clap 0→3'])
    // An unreadable code counts as no talents.
    expect(describeBuildChange(TALENT_DATA.warrior, 'bad', '3')).toEqual(['Improved Heroic Strike 0→3'])
  })
})
