// The optimizer on the real engine, kept small enough for CI (docs/optimizer.md).
import { describe, expect, it } from 'vitest'
import { armorConstant, armorReduction } from '../core/formulas'
import { decodeTalentCode } from '@/data/talents/types'
import { defaultConfig, TALENT_DATA } from '../defaults'
import { buildPlan } from '../plan/build'
import { PROFILES } from '../rules/profiles'
import type { SimConfig } from '../types'
import { bossOutcomeShares } from '../core/attack-table'
import { CRIT_IMMUNE, CRUSH_IMMUNE, defaultConstraints, effectiveHealth, formatConstraint, meetsSheet, parseConstraint, sheetValues } from './constraints'
import { describeBuildChange } from './describe'
import { type FightRunner, localFightRunner, SearchTooLargeError } from './fights'
import {
  applyCandidate,
  BUDGETS,
  confirm,
  confirmFights,
  FIRST_ROUND_MIN,
  firstRound,
  fitBudget,
  isSetup,
  MAX_SEARCH_FIGHTS,
  MIN_CONFIRM_FIGHTS,
  MIN_FIRST_ROUND,
  optimize,
  optimizeInTurns,
  type OptimizeOptions,
  type OptimizeProgress,
  type TalentSearch,
  setupCandidate,
} from './optimize'
import { SCREEN_JOB_FIGHTS, screenTalents } from './screen'
import { brokenConstraints } from './talents'

const fixed = (config: SimConfig, seed = 1): SimConfig => ({ ...config, run: { mode: 'fixed', iterations: 0, seed } })
/** The bear's 8/43/0 build before T3 made the optimizer's winner over it the default. */
const OLD_BEAR = '050012-5523032120132210551-'
const MAUL = 'druid.bear.maul.minRage'

describe('screenTalents', () => {
  it('sorts the Protection warrior’s talents by what the sim measures', async () => {
    const config = fixed(defaultConfig('warrior-protection'))
    const screen = await screenTalents({ config, data: TALENT_DATA.warrior, runner: localFightRunner(), goal: 'balanced', fights: 40 })
    const role = (name: string) => screen.verdicts.find((v) => v.name === name)!
    // A talent the engine never reads leaves the plan alone: no fights needed to know.
    expect(role('Improved Hamstring')).toMatchObject({ role: 'none', planChanges: false })
    expect(role('Improved Shield Wall')).toMatchObject({ role: 'none', planChanges: false })
    // Toughness changes armor from items: damage taken, not threat (Forever's rage from hits is before mitigation).
    expect(role('Toughness')).toMatchObject({ role: 'tie-break', planChanges: true, scoreChanges: false, tieChanges: true })
    // Less damage taken is a better tie-break, higher: Toughness's is above zero.
    expect(role('Toughness').tieEffect!.mean).toBeGreaterThan(0)
    for (const name of ['Shield Slam', 'Defiance', 'Cruelty', 'Focused Rage']) expect(role(name).role).toBe('objective')
    expect(role('Defiance').effect!.mean).toBeGreaterThan(0)
    expect(screen.roles.size).toBe(screen.verdicts.length)
  })

  it('a talent that only adds threat does nothing for DPS: Iron Creed for Retribution (OG-4)', async () => {
    const config = fixed(defaultConfig('paladin-retribution'))
    const ironCreed = TALENT_DATA.paladin.trees.flatMap((t) => t.talents).find((t) => t.name === 'Iron Creed')!
    // The setup takes Holy Strike, so Iron Creed changes its threat: the plan changes, and so does TPS.
    const screen = async (goal: 'dps' | 'tps') =>
      (await screenTalents({ config, data: TALENT_DATA.paladin, runner: localFightRunner(), goal, fights: 10 })).verdicts.find((v) => v.id === ironCreed.id)!
    const forDps = await screen('dps')
    expect(forDps).toMatchObject({ planChanges: true, scoreChanges: false, role: 'none' })
    expect((await screen('tps')).role).toBe('objective')
  })

  it('keeps a few runs in flight, and a cancel stops it before the next run starts (O1-9)', async () => {
    const config = fixed(defaultConfig('warrior-protection'))
    let inFlight = 0
    let most = 0
    let started = 0
    const lanes = 3
    const zeros = (n: number) => ({ dps: new Float64Array(n), tps: new Float64Array(n), taken: new Float64Array(n) })
    const runner: FightRunner = {
      lanes,
      run: async (_source, _from, count) => {
        started++
        most = Math.max(most, ++inFlight)
        await new Promise((resolve) => setTimeout(resolve, 1))
        inFlight--
        return zeros(count)
      },
    }
    const screen = await screenTalents({ config, data: TALENT_DATA.warrior, runner, goal: 'balanced', fights: 4 })
    expect(most).toBe(2 * lanes)
    expect(started).toBe(screen.fights / 4)
    // Cancelled after 5 runs: the runs already in flight finish, and no more start.
    const controller = new AbortController()
    started = 0
    const run = screenTalents({ config, data: TALENT_DATA.warrior, runner, goal: 'balanced', fights: 4, signal: controller.signal, onProgress: (done) => done === 5 && controller.abort() })
    await expect(run).rejects.toThrow(/cancelled/)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(started).toBeLessThanOrEqual(5 + 2 * lanes)
  })

  it('runs each plan’s fights in jobs of at most 250, with the same verdicts however they’re split (OV4-3)', async () => {
    const config = fixed(defaultConfig('warrior-protection'))
    // A long screen (3,000 fights a plan) never hands the runner more than 250 at once.
    const counts: number[] = []
    const zeros = (n: number) => ({ dps: new Float64Array(n), tps: new Float64Array(n), taken: new Float64Array(n) })
    const runner: FightRunner = {
      lanes: 2,
      run: async (_source, from, count) => {
        expect(from % SCREEN_JOB_FIGHTS).toBe(0)
        counts.push(count)
        return zeros(count)
      },
    }
    const long = await screenTalents({ config, data: TALENT_DATA.warrior, runner, goal: 'balanced', fights: 3000 })
    expect(Math.max(...counts)).toBe(SCREEN_JOB_FIGHTS)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(long.fights)
    // Split into jobs of 7 fights or run whole, the screen's verdicts are the same.
    const whole = await screenTalents({ config, data: TALENT_DATA.warrior, runner: localFightRunner(), goal: 'balanced', fights: 20, jobFights: 1000 })
    const split = await screenTalents({ config, data: TALENT_DATA.warrior, runner: localFightRunner(), goal: 'balanced', fights: 20, jobFights: 7 })
    expect(split.verdicts).toEqual(whole.verdicts)
    expect(split.fights).toBe(whole.fights)
  }, 60_000)
})

describe('optimize', () => {
  // The bear's Feral talents with everything but a few kept: a space of a handful of builds.
  const bear = fixed(defaultConfig('druid-feral-bear'))
  // Max ranks only: the default searches every rank of one talent a build too (OG-2), a space ten
  // times the size, and these tests are about other rules.
  const search = {
    minPoints: { 'Feral Combat': 31 },
    screenFights: 40,
    searchPartials: false,
  }

  it('races a small talent space to a leader, and does it the same way twice', async () => {
    const run = (capacity: number) =>
      optimize({ config: bear, talents: search, budget: { fights: 40_000, initialFights: 40 }, runner: localFightRunner(capacity), top: 5 })
    const a = await run(48)
    // A tank's default goal is Balanced (D30).
    expect(a.goal).toBe('balanced')
    expect(a.scoredGoal).toBe('balanced')
    expect(a.space!.builds).toBeGreaterThan(10)
    expect(a.candidates[0].talents).toBe(bear.talents)
    // No talent is kept by name (D30): the space keeps only the tree's minimum.
    expect(a.space).not.toHaveProperty('floor')
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
      talents: search,
      constraints: [{ stat: 'ehp', min: 1, relative: true }],
      budget: { fights: 20_000, initialFights: 20 },
      runner: localFightRunner(),
    })
    // Heart of the Wild changes effective health, which the limit reads, so it's a dimension whatever
    // the screen made of it: searched by what it changes on the sheet, not by its name.
    const hotw = keepEhp.screen!.verdicts.find((v) => v.name === 'Heart of the Wild')!
    expect(hotw.sheetStats).toContain('ehp')
    expect(keepEhp.space!.dimensions.map((d) => d.id)).toContain(hotw.id)
    if (hotw.role !== 'objective') expect(keepEhp.space!.constrained).toContain(hotw.id)
    // Every build without it has less health than the default, so only builds with it race.
    expect(keepEhp.excluded.sheet).toBeGreaterThan(0)
    expect(keepEhp.candidates.length).toBeGreaterThan(1)
    for (const c of keepEhp.candidates.slice(1)) expect(describeBuildChange(TALENT_DATA.druid, bear.talents, c.talents)).not.toContain('Heart of the Wild 5→0')
    for (const s of keepEhp.race.standings) expect(keepEhp.sheets[s.candidate].ehp).toBeGreaterThanOrEqual(keepEhp.reference.ehp)
  }, 60_000)

  it('a constraint that can’t bind makes no dimension: the space is the one without it (OG-1)', async () => {
    const run = (constraints: { stat: 'ehp'; min: number; relative: true }[]) =>
      optimize({ config: bear, talents: search, constraints, budget: { fights: 20_000, initialFights: 20 }, runner: localFightRunner(), top: 1 })
    // Half the default's effective health: no build of the bear's falls that low, with Heart of the
    // Wild and Thick Hide or without.
    const low = await run([{ stat: 'ehp', min: 0.5, relative: true }])
    const none = await run([])
    const readers = low.screen!.verdicts.filter((v) => v.role !== 'objective' && v.sheetStats.includes('ehp')).map((v) => v.id)
    expect(readers.length).toBeGreaterThan(0)
    expect(low.space!.constrained).toEqual([])
    expect(low.space!.notBinding).toEqual(readers)
    expect(low.space!.dimensions).toEqual(none.space!.dimensions)
    expect(low.space!.builds).toBe(none.space!.builds)
    expect(low.excluded.sheet).toBe(0)
    // The whole default: a limit the builds without them miss makes them dimensions (the test above).
    const high = await run([{ stat: 'ehp', min: 1, relative: true }])
    expect(high.space!.constrained).toEqual(readers)
    expect(high.space!.notBinding).toEqual([])
    expect(high.space!.builds).toBeGreaterThan(none.space!.builds)
  }, 60_000)

  it('searches partial ranks by default, and max ranks only when that space passes the builds’ limit or the fight cap, saying so (OG-2, OGV-2)', async () => {
    const run = (talents: TalentSearch, extra: Partial<OptimizeOptions> = {}) =>
      optimize({ config: bear, talents, budget: { fights: 3_000, initialFights: 2 }, runner: localFightRunner(), top: 1, ...extra })
    const plain = await run(search)
    const byDefault = { minPoints: search.minPoints, screenFights: search.screenFights }
    const partials = await run(byDefault)
    expect(plain.space!.searchPartials).toBe(false)
    expect(partials.space!.searchPartials).toBe(true)
    expect(partials.space!.builds).toBeGreaterThan(plain.space!.builds)
    expect(partials.space!.narrowed).toBeUndefined()
    expect(partials.notes).toEqual([])
    // A limit the max-rank space fits and the partial one doesn't: sized before it's listed (OGV-5).
    const limit = plain.space!.builds + 1
    const capped = await run({ ...byDefault, limit })
    expect(capped.space!.searchPartials).toBe(false)
    expect(capped.space!.truncated).toBe(false)
    expect(capped.space!.builds).toBe(plain.space!.builds)
    expect(capped.space!.narrowed).toEqual({ to: 'max ranks', passes: 'builds', builds: limit + 1, atLeast: true })
    expect(capped.notes[0]).toMatch(/^Narrowed to max ranks: every rank of one talent a build makes more than [\d,]+ builds, the most a search lists/)
    // A cap on fights that races the max-rank space at 50 fights each and not the partial one: the
    // budget grows to the cap, not past it, and the space narrows (OGV-2).
    const maxFights = plain.screen!.fights + Math.ceil((50 * (plain.space!.builds + 3)) / 0.9)
    expect(50 * (partials.space!.builds + 2)).toBeGreaterThan(0.9 * (maxFights - plain.screen!.fights))
    const small = await run(byDefault, { budget: { fights: 3_000 }, maxFights })
    expect(small.space!.searchPartials).toBe(false)
    expect(small.space!.builds).toBe(plain.space!.builds)
    expect(small.space!.narrowed).toEqual({ to: 'max ranks', passes: 'fights', builds: partials.space!.builds, atLeast: false })
    expect(small.notes[0]).toMatch(/^Narrowed to max ranks: every rank of one talent a build makes [\d,]+ builds, more than the cap of [\d,]+ fights a search races at 50 fights each/)
    expect(small.budget.initialFights).toBe(50)
    expect(small.budget.cap).toBe(maxFights)
    expect(small.budget.fights).toBeLessThanOrEqual(maxFights - small.screen!.fights)
    expect(small.fights).toBeLessThanOrEqual(maxFights)
  }, 120_000)

  it('grows a small budget up to the cap so every plan runs 50 fights first, and tells the fights and time before the race (OGV-2)', async () => {
    // Stopped once the space is known: the budget, the estimate and the notes come before any race fight.
    const controller = new AbortController()
    let space: Extract<OptimizeProgress, { phase: 'space' }> | undefined
    const run = optimize({
      config: bear,
      talents: { minPoints: search.minPoints, screenFights: search.screenFights },
      budget: { fights: 3_000 },
      runner: localFightRunner(),
      signal: controller.signal,
      onProgress: (p) => {
        if (p.phase !== 'space') return
        space = p
        controller.abort()
      },
    })
    await expect(run).rejects.toThrow(/cancelled/)
    const plans = space!.candidates + 1
    expect(space!.space!.searchPartials).toBe(true)
    expect(space!.budget).toEqual({ fights: 2 * FIRST_ROUND_MIN * plans, initialFights: FIRST_ROUND_MIN, cap: MAX_SEARCH_FIGHTS })
    expect(space!.notes).toEqual([
      `${plans.toLocaleString('en-US')} plans (the baseline included) need ${(FIRST_ROUND_MIN * plans).toLocaleString('en-US')} fights for a first round of 50 each: the budget grew from 3,000 to ${(2 * FIRST_ROUND_MIN * plans).toLocaleString('en-US')} fights (the cap leaves the race ${(MAX_SEARCH_FIGHTS - space!.screen!.fights).toLocaleString('en-US')}).`,
    ])
    expect(space!.estimate.screenFights).toBe(space!.screen!.fights)
    expect(space!.estimate.raceFights).toBe(space!.budget.fights)
    expect(space!.estimate.fights).toBe(space!.screen!.fights + space!.budget.fights)
    expect(space!.estimate.seconds).toBeGreaterThan(0)
  }, 120_000)

  it('a caller’s large first round never narrows the space: it shrinks to fit the cap (OGV2-1, the verification’s bear probe)', async () => {
    // `--first 2000 --max-fights 1000000` on quick: 504 plans at 2,000 each pass the cap, but at 50
    // each they fit, so every rank is searched and the first round shrinks. Stopped once the space is known.
    const controller = new AbortController()
    let space: Extract<OptimizeProgress, { phase: 'space' }> | undefined
    const run = optimize({
      config: bear,
      talents: { minPoints: search.minPoints, screenFights: search.screenFights },
      budget: { ...BUDGETS.quick, initialFights: 2_000 },
      maxFights: 1_000_000,
      runner: localFightRunner(),
      signal: controller.signal,
      onProgress: (p) => {
        if (p.phase !== 'space') return
        space = p
        controller.abort()
      },
    })
    await expect(run).rejects.toThrow(/cancelled/)
    const plans = space!.candidates + 1
    const raceCap = 1_000_000 - space!.screen!.fights
    // The probe's case: at 2,000 fights each the plans pass 90% of what the cap leaves the race.
    expect(2_000 * plans).toBeGreaterThan(0.9 * raceCap)
    expect(space!.space!.searchPartials).toBe(true)
    expect(space!.space!.narrowed).toBeUndefined()
    expect(space!.notes.some((n) => n.startsWith('Narrowed'))).toBe(false)
    expect(space!.budget).toEqual({ fights: raceCap, initialFights: Math.floor((0.9 * raceCap) / plans), cap: 1_000_000 })
    expect(space!.budget.initialFights).toBeLessThan(2_000)
    expect(space!.notes.at(-1)).toMatch(/^A first round of 2,000 fights each over [\d,]+ plans \(the baseline included\) passes the [\d,]+ fights the search's cap leaves the race: it runs [\d,]+ each\.$/)
  }, 120_000)

  it('refuses a search too large for the cap even at its narrowest, before the fights it can’t afford (OGV-2)', async () => {
    let fights = 0
    const counting: FightRunner = {
      lanes: 1,
      run: (source, from, count) => {
        fights += count
        return localFightRunner().run(source, from, count)
      },
    }
    // A cap below the screen's fights: it throws before the first fight.
    await expect(optimize({ config: bear, talents: search, budget: { fights: 3_000 }, maxFights: 1_000, runner: counting })).rejects.toThrow(
      /^The talent screen runs [\d,]+ fights, more than the cap of 1,000 a search/,
    )
    expect(fights).toBe(0)
    // A cap the screen fits but whose rest can't race the max-rank space at 20 fights each.
    const probe = await optimize({ config: bear, talents: search, budget: { fights: 3_000, initialFights: 2 }, runner: localFightRunner(), top: 1 })
    const tooSmall = probe.screen!.fights + 10 * probe.candidates.length
    await expect(optimize({ config: bear, talents: search, budget: { fights: 3_000 }, maxFights: tooSmall, runner: localFightRunner() })).rejects.toThrow(SearchTooLargeError)
    await expect(optimize({ config: bear, talents: search, budget: { fights: 3_000 }, maxFights: tooSmall, runner: localFightRunner() })).rejects.toThrow(
      /plans \(the baseline included\) don't fit the cap of [\d,]+ fights a search, even with max ranks only, at 20 fights each/,
    )
    // A budget over the cap is cut to it, and says so.
    const cut = await optimize({ config: bear, talents: search, budget: { fights: 3_000, initialFights: 2 }, maxFights: probe.screen!.fights + 2_000, runner: localFightRunner(), top: 1 })
    expect(cut.budget.fights).toBe(2_000)
    expect(cut.notes[0]).toMatch(/^The budget of 3,000 fights passes the 2,000 the search's cap leaves the race/)
    expect(cut.fights).toBeLessThanOrEqual(probe.screen!.fights + 2_000)
  }, 120_000)

  it('confirms a winner on a fresh seed against the baseline (D23), and names the [?] assumptions it relies on', async () => {
    // The bear's 8/43/0 build before T3 (the default now is the optimizer's winner over it).
    const candidate = { talents: OLD_BEAR, rotation: {} }
    const check = await confirm({ config: bear, candidate, goal: 'balanced', seed: 99, fights: 300, runner: localFightRunner() })
    expect(check.fights).toBe(300)
    expect(check.vsBaseline.score.halfWidth).toBeGreaterThan(0)
    expect(check.clears).toBe(check.vsBaseline.score.mean - check.vsBaseline.score.halfWidth > 0)
    // Every assumption either build relies on is in exactly one list.
    const bundle = buildPlan(applyCandidate(bear, candidate))
    const { winnerOnly, baselineOnly, shared } = check.assumptions
    expect(new Set([...winnerOnly, ...shared].map((a) => a.id))).toEqual(new Set(bundle.assumptions.map((a) => a.id)))
    expect(new Set([...baselineOnly, ...shared].map((a) => a.id))).toEqual(new Set(buildPlan(bear).assumptions.map((a) => a.id)))
    expect(shared.length).toBeGreaterThan(0)
  }, 60_000)

  it('a confirmation counts under the cap: it runs what the search left, and no more than asked (OGV2-2)', () => {
    // The CLI's two checks (ratings applied and ignored), each the winner and the baseline: 4 × 40,000.
    expect(confirmFights(40_000, 24_000_000 - 1_250_000, 2)).toEqual({ fights: 40_000, clamped: false })
    expect(confirmFights(40_000, 160_000, 2)).toEqual({ fights: 40_000, clamped: false })
    // A search that spent all but 100,000 of the cap: 25,000 each, 100,000 in all.
    expect(confirmFights(40_000, 100_000, 2)).toEqual({ fights: 25_000, clamped: true })
    expect(confirmFights(40_000, 100_000, 1)).toEqual({ fights: 40_000, clamped: false })
    // Fewer than MIN_CONFIRM_FIGHTS each left: it doesn't run.
    expect(confirmFights(40_000, 4 * MIN_CONFIRM_FIGHTS, 2)).toEqual({ fights: MIN_CONFIRM_FIGHTS, clamped: true })
    expect(confirmFights(40_000, 4 * MIN_CONFIRM_FIGHTS - 1, 2)).toBeNull()
    expect(confirmFights(40_000, -5, 2)).toBeNull()
  })

  it('a tank’s talent search spends 31 points in its tank tree unless told otherwise (D30)', async () => {
    const run = (minPoints?: Record<string, number>) =>
      optimize({ config: bear, talents: { screenFights: 20, searchPartials: false, ...(minPoints ? { minPoints } : {}) }, budget: { fights: 4_000, initialFights: 2 }, runner: localFightRunner(), top: 1 })
    const byDefault = await run()
    expect(byDefault.space!.minPoints).toEqual({ 'Feral Combat': 31 })
    const feral = TALENT_DATA.druid.trees.findIndex((t) => t.id === 'Feral Combat')
    const points = (code: string) => TALENT_DATA.druid.trees[feral].talents.reduce((n, t) => n + (decodeTalentCode(TALENT_DATA.druid, code)[t.id] ?? 0), 0)
    for (const c of byDefault.candidates.slice(1)) expect(points(c.talents)).toBeGreaterThanOrEqual(31)
    // A minimum for the tank tree replaces its 31 (0 drops it); one for another tree joins it (OV-6).
    const none = await run({ 'Feral Combat': 0 })
    expect(none.space!.minPoints).toEqual({ 'Feral Combat': 0 })
    expect(none.space!.builds).toBeGreaterThan(byDefault.space!.builds)
    const both = await run({ Balance: 5 })
    expect(both.space!.minPoints).toEqual({ 'Feral Combat': 31, Balance: 5 })
    for (const c of both.candidates.slice(1)) expect(points(c.talents)).toBeGreaterThanOrEqual(31)
  }, 60_000)

  it('sizes the first round from the budget', () => {
    expect(firstRound({ fights: 1_500_000 }, 7000)).toBe(64)
    expect(firstRound({ fights: 1_500_000 }, 10)).toBe(1000)
    expect(firstRound({ fights: 1_000 }, 7000)).toBe(50)
    expect(firstRound({ fights: 1_000, initialFights: 7 }, 7000)).toBe(7)
  })

  it('fits a large space into its budget up to the hard cap, and says when it can’t (O1-9, OGV-2)', () => {
    // quick over 7,000 plans: 64 fights each, 30% of the budget, as firstRound says.
    expect(fitBudget({ fights: 1_500_000 }, 7000)).toEqual({ fights: 1_500_000, initialFights: 64, notes: [], fits: true })
    // quick over 27,000: 50 each is exactly 90% of the budget, still the usual first round.
    expect(fitBudget({ fights: 1_500_000 }, 27_000)).toEqual({ fights: 1_500_000, initialFights: 50, notes: [], fits: true })
    // quick over 50,000: 50 each would be 2.5M, so the budget grows to 50 each and as much again,
    // under the cap (thorough's 24M). It counts plans, the baseline included, and says so (OV4-5).
    const grown = fitBudget({ fights: 1_500_000 }, 50_000)
    expect(grown).toMatchObject({ fights: 5_000_000, initialFights: FIRST_ROUND_MIN, fits: true })
    expect(grown.notes).toEqual(['50,000 plans (the baseline included) need 2,500,000 fights for a first round of 50 each: the budget grew from 1,500,000 to 5,000,000 fights (the cap leaves the race 24,000,000).'])
    // quick over 300,000: 50 each is 15M, under 90% of the cap, so the budget grows to the cap.
    expect(fitBudget({ fights: 1_500_000 }, 300_000)).toMatchObject({ fights: MAX_SEARCH_FIGHTS, initialFights: 50, fits: true })
    // 500,000 plans at 50 each is 25M, past 90% of the cap: it doesn't fit, and the caller narrows the
    // space; as a last resort the first round shrinks to fit the cap (43 each).
    const over = fitBudget({ fights: 1_500_000 }, 500_000)
    expect(over).toMatchObject({ fights: MAX_SEARCH_FIGHTS, initialFights: 43, fits: false })
    expect(over.notes[0]).toMatch(/^500,000 plans \(the baseline included\) don't fit the 24,000,000 fights the search's cap leaves the race at 50 fights each: the first round runs 43 each/)
    // 1,200,000 plans: fewer than MIN_FIRST_ROUND each fit; optimize() refuses that.
    expect(fitBudget({ fights: 1_500_000 }, 1_200_000).initialFights).toBeLessThan(MIN_FIRST_ROUND)
    // A budget over the cap is cut to it, and a cap given is never passed.
    expect(fitBudget({ fights: 50_000_000 }, 10)).toMatchObject({ fights: MAX_SEARCH_FIGHTS, initialFights: 1000, fits: true })
    expect(fitBudget({ fights: 50_000_000 }, 10).notes[0]).toMatch(/^The budget of 50,000,000 fights passes the 24,000,000 the search's cap leaves the race/)
    expect(fitBudget({ fights: 1_500_000 }, 50_000, 3_000_000)).toMatchObject({ fights: 3_000_000, initialFights: 50, fits: true })
    // A caller's first round past the cap shrinks to fit it, and still fits: 504 plans at 2,000 each
    // is 1,008,000, past 90% of 979,200; 1,748 each fit (OGV2-1).
    const asked = fitBudget({ fights: 1_500_000, initialFights: 2_000 }, 504, 979_200)
    expect(asked).toMatchObject({ fights: 979_200, initialFights: 1_748, fits: true })
    expect(asked.notes.at(-1)).toBe('A first round of 2,000 fights each over 504 plans (the baseline included) passes the 979,200 fights the search\'s cap leaves the race: it runs 1,748 each.')
    // One that can't shrink to FIRST_ROUND_MIN doesn't fit, as the usual one wouldn't.
    expect(fitBudget({ fights: 1_500_000, initialFights: 2_000 }, 30_000, 979_200)).toMatchObject({ initialFights: 29, fits: false })
    // The cap is thorough's budget, never raised automatically.
    expect(MAX_SEARCH_FIGHTS).toBe(BUDGETS.thorough.fights)
  })

  it('the baseline is only the measuring stick: a setup that breaks the talent constraints is never a candidate (D30)', async () => {
    // The default bear has Feral Swiftness 2; a search that keeps it at 1 can't answer with the default.
    const report = await optimize({ config: bear, talents: { screenFights: 20, searchPartials: false, keep: { 'Feral Swiftness': 1 } }, budget: { fights: 4_000, initialFights: 2 }, runner: localFightRunner(), top: 3 })
    expect(report.setupFails).toEqual(['Feral Swiftness 2/1'])
    expect(report.excluded.talents).toBe(1)
    expect(report.candidates[0]).toEqual(setupCandidate(bear))
    expect(report.candidates.slice(1).some((c) => c.talents === bear.talents)).toBe(false)
    expect(report.race.leader).not.toBeNull()
    expect(report.race.leader).not.toBe(0)
    expect(report.race.standings.some((st) => st.candidate === 0)).toBe(false)
    expect(report.blocked).toEqual([])
    // Keeping what the default has, a copy of it is a candidate like any build.
    const keeps = await optimize({ config: bear, talents: { screenFights: 20, searchPartials: false }, budget: { fights: 4_000, initialFights: 2 }, runner: localFightRunner(), top: 1 })
    expect(keeps.setupFails).toEqual([])
    expect(keeps.candidates[1]).toEqual(setupCandidate(bear))
  }, 60_000)

  it('the current setup wins as a regular candidate when it’s valid and best', async () => {
    // Maul held for 90 rage costs the bear threat; the setup's own rotation is the best of the two.
    const report = await optimize({ config: bear, rotations: [{ [MAUL]: 90 }], budget: { fights: 40_000, initialFights: 500 }, runner: localFightRunner() })
    expect(report.candidates).toEqual([setupCandidate(bear), setupCandidate(bear), { talents: bear.talents, rotation: { [MAUL]: 90 } }])
    expect(report.race.leader).toBe(1)
    expect(isSetup(bear, report.candidates[report.race.leader!])).toBe(true)
    // It's paired with the baseline, fight for fight: the same fights, no change.
    expect(report.race.standings[0].vsBaseline.score).toEqual({ mean: 0, halfWidth: 0 })
    expect(report.race.standings.map((st) => st.candidate)).not.toContain(0)
  }, 60_000)

  it('with no candidate meeting the constraints there’s no answer, and the report names what blocks (OV-2)', async () => {
    // The paladin's default gear can't reach 440 defense with any build: crit immunity blocks every one.
    const paladin = fixed(defaultConfig('paladin-protection'))
    const report = await optimize({
      config: paladin,
      talents: { screenFights: 10, searchPartials: false },
      constraints: [...defaultConstraints('tank'), CRIT_IMMUNE],
      budget: { fights: 4_000, initialFights: 2 },
      runner: localFightRunner(),
    })
    expect(report.race.leader).toBeNull()
    expect(report.race.status).toBe('none')
    expect(report.candidates).toEqual([setupCandidate(paladin)])
    expect(report.race.standings).toEqual([])
    expect(report.blocked).toHaveLength(1)
    expect(report.blocked[0]).toMatch(/^crit immune: no candidate reaches the defense it needs on this gear; the closest has \d+ defense, leaving the boss \d+\.\d\d% crit$/)
    // The default breaks crit immunity itself.
    expect(report.setupFails).toEqual(['crit immune'])
    expect(report.race.leader).toBeNull()
    expect(report.excluded.sheet).toBeGreaterThan(1000)
  }, 120_000)

  it('with no legal build fitting the talent constraints, it says so and lists them together (OV2-3)', async () => {
    // Moonkin Form kept (Balance's 31-point talent), beside 31 in Feral Combat: no 51-point build fits.
    const report = await optimize({ config: bear, talents: { screenFights: 10, searchPartials: false, keep: { 'Moonkin Form': 1 } }, budget: { fights: 4_000, initialFights: 2 }, runner: localFightRunner() })
    expect(report.space!.builds).toBe(0)
    expect(report.race.leader).toBeNull()
    expect(report.blocked).toEqual([
      'talents: no legal 51-point build fits the talent constraints together: kept talents (Moonkin Form 1); at least 31 points in Feral Combat',
    ])
  }, 60_000)

  it('a search that keeps its build names the talent constraints the build breaks (OV2-8)', async () => {
    // A rotation pass holds the talents without searching them: the default takes Ferocity.
    const report = await optimize({
      config: bear,
      talents: { fixedBuild: true, exclude: ['Ferocity'], searchPartials: false },
      rotations: [{ [MAUL]: 90 }],
      budget: { fights: 4_000, initialFights: 2 },
      runner: localFightRunner(),
    })
    expect(report.candidates).toEqual([setupCandidate(bear)])
    expect(report.blocked).toEqual(["talents: no candidate keeps the talent constraints (kept and excluded talents, the trees' minimums): Ferocity taken"])
  }, 60_000)

  it('names sheet constraints each met but never together (OV2-8)', async () => {
    // The warrior's builds differ in armor (Toughness): at least the most and at most the least can't both hold.
    const warrior = fixed(defaultConfig('warrior-protection'))
    const talents = { screenFights: 10, searchPartials: false }
    const probe = await optimize({ config: warrior, talents, budget: { fights: 4_000, initialFights: 2 }, runner: localFightRunner(), top: 1 })
    const armor = probe.candidates.slice(1).map((c) => buildPlan(applyCandidate(warrior, c)).sheet.armor)
    expect(Math.max(...armor)).toBeGreaterThan(Math.min(...armor))
    const report = await optimize({
      config: warrior,
      talents,
      constraints: [
        { stat: 'armor', min: Math.max(...armor) },
        { stat: 'armor', max: Math.min(...armor) },
      ],
      budget: { fights: 4_000, initialFights: 2 },
      runner: localFightRunner(),
    })
    expect(report.race.leader).toBeNull()
    expect(report.blocked).toEqual([`no candidate meets armor>=${Math.max(...armor)} and armor<=${Math.min(...armor)} together, though each alone is met`])
  }, 120_000)

  it('answers with the leader, and keeps no talent by its name: the space is the screen’s alone (D30)', async () => {
    const warrior = fixed(defaultConfig('warrior-protection'))
    const report = await optimize({ config: warrior, talents: { screenFights: 20, searchPartials: false }, budget: { fights: 60_000, initialFights: 40 }, runner: localFightRunner(), top: 3 })
    // No talent is kept, and every dimension is an objective talent or one a constraint reads.
    expect(report.space).not.toHaveProperty('floor')
    expect(report.space).not.toHaveProperty('preferred')
    const roles = new Map(report.screen!.verdicts.map((v) => [v.id, v]))
    for (const d of report.space!.dimensions) expect(roles.get(d.id)!.role === 'objective' || report.space!.constrained.includes(d.id), d.name).toBe(true)
    // The answer is the leader, first in the standings.
    expect(report.race.leader).not.toBeNull()
    expect(report.race.standings[0].candidate).toBe(report.race.leader)
    expect(report.race.standings[0].state).toBe('leader')
  }, 120_000)

  it('Defense: the screen reads damage taken, and the answer takes less of it than the default (D30, the goals)', async () => {
    const warrior = fixed(defaultConfig('warrior-protection'))
    const report = await optimize({ config: warrior, goal: 'defense', talents: { screenFights: 40, searchPartials: false }, budget: { fights: 200_000, initialFights: 100 }, runner: localFightRunner(), top: 3 })
    expect(report.goal).toBe('defense')
    expect(report.scoredGoal).toBe('defense')
    const verdict = (name: string) => report.screen!.verdicts.find((v) => v.name === name)!
    // Toughness's armor lowers damage taken: for Defense it's objective, and its effect (minus the
    // damage taken) is above zero. For Balanced it was a tie-break only (the screen's test above).
    expect(verdict('Toughness').role).toBe('objective')
    expect(verdict('Toughness').effect!.mean).toBeGreaterThan(0)
    // Defiance changes threat but not damage taken: for Defense, TPS breaks a tie, so it's a tie-break talent.
    expect(verdict('Defiance').role).toBe('tie-break')
    expect(verdict('Defiance').tieEffect!.mean).toBeGreaterThan(0)
    // The leader takes less damage than the default, and its score is minus its damage taken.
    const lead = report.race.standings[0]
    expect(lead.candidate).toBe(report.race.leader)
    expect(lead.vsBaseline.taken.mean).toBeLessThan(0)
    expect(lead.vsBaseline.score.mean).toBeCloseTo(-lead.vsBaseline.taken.mean, 9)
    expect(describeBuildChange(TALENT_DATA.warrior, warrior.talents, report.candidates[lead.candidate].talents)).toContain('Toughness 1→5')
    // Confirmed on a fresh seed, less damage taken clears the bar: the sign is the goal's.
    const check = await confirm({ config: warrior, candidate: report.candidates[lead.candidate], goal: 'defense', seed: 77, fights: 400, runner: localFightRunner() })
    expect(check.vsBaseline.score.mean).toBeCloseTo(-check.vsBaseline.taken.mean, 9)
    expect(check.clears).toBe(check.vsBaseline.taken.mean + check.vsBaseline.taken.halfWidth < 0)
  }, 240_000)

  it('Defense is a tank’s goal, and Balanced for a DPS spec scores DPS (D30, the goals)', async () => {
    const fury = fixed(defaultConfig('warrior-fury'))
    await expect(optimize({ config: fury, goal: 'defense', rotations: [], budget: { fights: 1_000, initialFights: 10 }, runner: localFightRunner() })).rejects.toThrow(/Defense goal is for a tank/)
    const report = await optimize({ config: fury, goal: 'balanced', budget: { fights: 1_000, initialFights: 10 }, runner: localFightRunner() })
    expect(report.goal).toBe('balanced')
    expect(report.scoredGoal).toBe('dps')
  }, 60_000)

  it('TPS: the answer has at least the default’s TPS (D30, the goals)', async () => {
    const report = await optimize({ config: bear, goal: 'tps', talents: search, budget: { fights: 40_000, initialFights: 100 }, runner: localFightRunner(), top: 3 })
    expect(report.scoredGoal).toBe('tps')
    const lead = report.race.standings[0]
    expect(lead.vsBaseline.score).toEqual(lead.vsBaseline.tps)
    expect(lead.mean.score).toBeCloseTo(lead.mean.tps, 9)
  }, 60_000)

  it('a rotation search races the start’s own rotation beside its variants, each setup once (O1-1)', async () => {
    const start = { talents: bear.talents, rotation: { [MAUL]: 30 } }
    const report = await optimize({
      config: bear,
      start,
      rotations: [{ [MAUL]: 90 }, { [MAUL]: 30 }],
      budget: { fights: 2_000, initialFights: 2 },
      runner: localFightRunner(),
    })
    // The baseline, then the setup itself, the start, and the one variant that isn't the start: the
    // start's own isn't dropped.
    expect(report.candidates).toEqual([setupCandidate(bear), setupCandidate(bear), start, { talents: bear.talents, rotation: { [MAUL]: 90 } }])
  }, 60_000)

  it('searching talents and rotation together tries every build with the setup’s own rotation too (O1-1)', async () => {
    const report = await optimize({
      config: bear,
      talents: { screenFights: 20, searchPartials: false },
      rotations: [{ [MAUL]: 90 }],
      budget: { fights: 20_000, initialFights: 2 },
      runner: localFightRunner(),
      top: 1,
    })
    const contenders = report.candidates.slice(1)
    // The space's builds: those tried with the variant.
    const builds = new Set(contenders.filter((c) => c.rotation[MAUL] === 90).map((c) => c.talents))
    for (const talents of builds) {
      const own = contenders.filter((c) => c.talents === talents && !(MAUL in c.rotation))
      const variant = contenders.filter((c) => c.talents === talents && c.rotation[MAUL] === 90)
      expect(own.length).toBe(1)
      expect(variant.length).toBe(1)
    }
    // Besides the baseline, the setup itself races once, whether or not its build is in the space.
    expect(contenders.filter((c) => isSetup(bear, c))).toHaveLength(1)
    expect(report.candidates.length).toBe(1 + 2 * builds.size + (builds.has(bear.talents) ? 0 : 1))
  }, 60_000)

  it('in turns, a rotation pass keeps the talent pass’s winner when every variant is worse (O1-1, the review’s bear repro)', async () => {
    // From the bear's 8/43/0, the talent pass finds a far better build (about +14 points); Maul held
    // for 90 rage costs points on it (about 1.6 in the review's CLI run). The rotation pass must keep
    // the talent pass's winner, not fall back to the baseline because the variant lost to it.
    const old = { ...bear, talents: OLD_BEAR }
    const passes = await optimizeInTurns({
      config: old,
      talents: { screenFights: 40, searchPartials: false },
      rotations: [{ [MAUL]: 90 }],
      budget: { fights: 60_000, initialFights: 100 },
      runner: localFightRunner(),
      top: 3,
    })
    const winners = passes.map((r) => r.candidates[r.race.leader!])
    expect(winners[0].talents).not.toBe(OLD_BEAR)
    expect(passes.length).toBeGreaterThanOrEqual(2)
    // The rotation pass raced its start (the talent pass's winner, with the setup's rotation) and kept it.
    expect(passes[1].candidates).toContainEqual(winners[0])
    expect(winners[1]).toEqual(winners[0])
    // The final answer is never worse than any pass's winner, on the same fresh seed.
    const check = (candidate: (typeof winners)[number]) => confirm({ config: old, candidate, goal: 'balanced', seed: 4242, fights: 400, runner: localFightRunner() })
    const final = await check(winners[winners.length - 1])
    for (const w of winners) {
      const c = await check(w)
      expect(final.vsBaseline.score.mean).toBeGreaterThanOrEqual(c.vsBaseline.score.mean - 1e-9)
    }
  }, 120_000)

  it('in turns, every pass holds every candidate to the talent constraints (OV-1, the verification’s bear repro)', async () => {
    // Ferocity excluded, and Maul held for 90 rage: the default has Ferocity 5, so neither the talent
    // pass nor the rotation pass may answer with the setup, and no answer ever takes Ferocity.
    const exclude = ['Ferocity']
    const passes = await optimizeInTurns({
      config: bear,
      talents: { screenFights: 20, searchPartials: false, exclude },
      rotations: [{ [MAUL]: 90 }],
      budget: { fights: 20_000, initialFights: 50 },
      runner: localFightRunner(),
      top: 3,
    })
    expect(passes.length).toBeGreaterThanOrEqual(2)
    const ferocity = TALENT_DATA.druid.trees.flatMap((t) => t.talents).find((t) => t.name === 'Ferocity')!.id
    for (const r of passes) {
      expect(r.setupFails).toEqual(['Ferocity taken'])
      expect(r.race.leader).not.toBeNull()
      for (const c of r.candidates.slice(1)) expect(brokenConstraints(TALENT_DATA.druid, c.talents, { exclude: [ferocity] })).toEqual([])
    }
    // The rotation pass left the setup out (it takes Ferocity) and kept the talent pass's build.
    expect(passes[1].excluded.talents).toBe(1)
    expect(passes[1].candidates.slice(1).every((c) => c.talents === passes[0].candidates[passes[0].race.leader!].talents)).toBe(true)
  }, 120_000)

  it('in turns, the hard ceiling holds for the whole search: a pass that no longer fits ends the turns, saying so (OGV-2)', async () => {
    const options = { config: bear, talents: { screenFights: 20, searchPartials: false }, rotations: [{ [MAUL]: 90 }], budget: { fights: 4_000, initialFights: 20 }, runner: localFightRunner(), top: 1 }
    // The first pass on its own: a talent pass, screened under the variant too.
    const first = await optimize({ ...options, rotations: [], screenRotations: options.rotations })
    // A cap one fight over it leaves the rotation pass nothing to race with.
    const passes = await optimizeInTurns({ ...options, maxFights: first.fights + 1 })
    expect(passes).toHaveLength(1)
    expect(passes[0].race.leader).toBe(first.race.leader)
    expect(passes[0].fights).toBeLessThanOrEqual(first.fights + 1)
    expect(passes[0].turnsStopped).toMatch(/^The cap of [\d,]+ fights a search ended the turns after pass 1, with [01] left/)
    // Without the cap the turns go on.
    expect(first.turnsStopped).toBeUndefined()
  }, 120_000)

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
    expect(parseConstraint('ehp>=90%')).toEqual({ stat: 'ehp', min: 0.9, relative: true })
    // The race takes no limits on fight results (D30): a result metric is refused, saying so.
    for (const text of ['taken <= 102%', 'tps>=1000', 'dps>=90%']) expect(() => parseConstraint(text)).toThrow(/fight result: the optimizer takes limits only on the sheet/)
    expect(parseConstraint('health>=8000')).toEqual({ stat: 'health', min: 8000 })
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
    // D30: the EHP floor is a tank's only default; no damage-taken cap, and immunity is off.
    expect(floor).toEqual([{ stat: 'ehp', min: 0.9, relative: true }])
  })

  it('reads the boss’s crit and crush chances from the tables the engine and the Results use (D30)', () => {
    for (const spec of ['warrior-protection', 'druid-feral-bear', 'paladin-protection'] as const) {
      const bundle = buildPlan(fixed(defaultConfig(spec)))
      const values = sheetValues(bundle)
      // Crit from the table with no block buff; crush with the rotation's block buff up (OV-4).
      expect(values.bossCritPct).toBeCloseTo(bundle.sheet.bossTable!.crit, 12)
      expect(values.bossCrushPct).toBeCloseTo((bundle.sheet.bossTableUp?.table ?? bundle.sheet.bossTable!).crush, 12)
    }
    // The paladin keeps Holy Shield up: its crush reads that table, its crit doesn't. A table with
    // Holy Shield up that pushed crits off too wouldn't make the paladin crit immune.
    const paladin = buildPlan(fixed(defaultConfig('paladin-protection')))
    const up = paladin.sheet.bossTableUp!
    const pushed = { ...paladin, sheet: { ...paladin.sheet, bossTableUp: { ...up, table: { ...up.table, crit: 0, crush: 0 } } } }
    expect(sheetValues(pushed).bossCritPct).toBeCloseTo(paladin.sheet.bossTable!.crit, 12)
    expect(paladin.sheet.bossTable!.crit).toBeGreaterThan(0)
    expect(sheetValues(pushed).bossCrushPct).toBe(0)
    // A DPS spec's boss doesn't swing at it: no crits or crushing blows.
    const fury = sheetValues(buildPlan(fixed(defaultConfig('warrior-fury'))))
    expect([fury.bossCritPct, fury.bossCrushPct]).toEqual([0, 0])
    // combat-tables §8: 440 defense makes a level-63 boss's crit 0, and miss + dodge + parry + block
    // of 102.4% on the sheet (each less 0.6% for the boss's 315 skill) pushes crushing blows off.
    const at = (defense: number, dodge: number, parry: number, block: number) =>
      bossOutcomeShares({ playerLevel: 60, bossLevel: 63, defense, dodge, parry, block, canCrush: true, front: true })
    expect(at(440, 20, 20, 20).crit).toBe(0)
    expect(at(439, 20, 20, 20).crit).toBeCloseTo(0.04, 10)
    const uncrushable = at(440, 30, 25, 42.4) // miss 10% at 440 defense: 10 + 29.4 + 24.4 + 41.8 = 105.6 ≥ 100
    expect(uncrushable.crush).toBe(0)
    expect(at(300, 5, 5, 5).crush).toBe(15)
  })

  it('crit and crush immunity are sheet limits at zero, off by default', () => {
    const ref = sheetValues(buildPlan(fixed(defaultConfig('warrior-protection'))))
    expect(meetsSheet({ ...ref, bossCritPct: 0, bossCrushPct: 0 }, ref, [CRIT_IMMUNE, CRUSH_IMMUNE])).toBe(true)
    expect(meetsSheet({ ...ref, bossCritPct: 0.04, bossCrushPct: 0 }, ref, [CRIT_IMMUNE])).toBe(false)
    expect(meetsSheet({ ...ref, bossCritPct: 0, bossCrushPct: 1 }, ref, [CRUSH_IMMUNE])).toBe(false)
    expect(formatConstraint(CRIT_IMMUNE)).toBe('bossCritPct<=0')
    expect(parseConstraint('bossCrushPct<=0')).toEqual(CRUSH_IMMUNE)
    expect(defaultConstraints('tank')).not.toContainEqual(CRIT_IMMUNE)
    expect(defaultConstraints('tank')).not.toContainEqual(CRUSH_IMMUNE)
  })
})

describe('describeBuildChange', () => {
  it('lists the talents whose ranks differ, in code order', () => {
    expect(describeBuildChange(TALENT_DATA.warrior, '35-05-552101233301210531', '05-05-552131233301210531')).toEqual(['Improved Heroic Strike 3→0', 'Improved Thunder Clap 0→3'])
    // An unreadable code counts as no talents.
    expect(describeBuildChange(TALENT_DATA.warrior, 'bad', '3')).toEqual(['Improved Heroic Strike 0→3'])
  })
})
