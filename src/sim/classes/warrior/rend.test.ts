// Rend in the engine for today's warrior defaults (warrior.md §5.2 row 10b, §5.3 row 2; W4's review
// W4L-2 and W4L-6): Fury's Rend stance dance plays as its row says, and neither spec casts a Rend with
// less than one tick of the fight left, where it would never tick.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { STANCE } from '../../plan/types'
import type { RotationValue, SimConfig, SpecId } from '../../types'
import { REND, stanceSwapKeepTenths } from './abilities'
import { FOREVER } from '../../rules/profiles'

/** One Rend tick: less fight left than this and a Rend never ticks. */
const TICK_MS = REND.dotTickMs!

function run(spec: SpecId, opts: { rotation?: Record<string, RotationValue>; fight?: Partial<SimConfig['fight']>; fights?: number; seed?: number } = {}) {
  const d = defaultConfig(spec)
  const { plan } = buildPlan({ ...d, rotation: opts.rotation ?? {}, fight: { ...d.fight, ...opts.fight }, run: { ...d.run, seed: opts.seed ?? 4242 } })
  const sim = new Sim(plan)
  const id = (i: number) => plan.abilities[i].id
  const cooldown = (name: string) => plan.abilities.find((a) => a.id === name)?.cooldownMs ?? 0
  const rends: { t: number; stance: number; inPhase: boolean; left: number }[] = []
  /** Each swap to Battle Stance and what followed it: whether a Rend came at once, the swap back, and when Bloodthirst and Whirlwind came ready. */
  const dances: { t: number; before: number; after: number; rend: boolean; backAt: number | null; backTo: number | null; readyAt: number[] }[] = []
  let stance = plan.stance
  let lastCast: Record<string, number> = {}
  let fightRends: typeof rends = []
  let fightDances: typeof dances = []
  sim.stanceTrace = (to, t, before, after) => {
    const open = fightDances.at(-1)
    if (open && open.backAt === null && to !== STANCE.battle) Object.assign(open, { backAt: t, backTo: to })
    if (to === STANCE.battle) {
      const readyAt = ['bloodthirst', 'whirlwind'].filter((n) => n in lastCast).map((n) => lastCast[n] + cooldown(n))
      fightDances.push({ t, before, after, rend: false, backAt: null, backTo: null, readyAt })
    }
    stance = to
  }
  sim.castTrace = (a, t) => {
    lastCast[id(a)] = t
    if (id(a) !== 'rend') return
    fightRends.push({ t, stance, inPhase: t >= sim.executeAtMs, left: 0 })
    const dance = fightDances.at(-1)
    if (dance && dance.t === t) dance.rend = true
  }
  const fights = opts.fights ?? 200
  for (let i = 0; i < fights; i++) {
    lastCast = {}
    fightRends = []
    fightDances = []
    stance = plan.stance
    sim.runFight(i)
    for (const r of fightRends) r.left = sim.fightMs - r.t
    rends.push(...fightRends)
    dances.push(...fightDances.filter((d) => d.rend))
  }
  return { plan, rends, dances }
}

describe('Fury’s Rend dance, row 10b (warrior.md §5.2)', () => {
  const { plan, rends, dances } = run('warrior-fury')
  const keep = stanceSwapKeepTenths(new Map([['Improved Tactical Mastery', 3]]), FOREVER)

  it('the default build keeps 19 rage on a swap (Improved Tactical Mastery 3/5)', () => {
    expect(keep).toBe(190)
    expect(plan.stanceSwap.keepTenths).toBe(190)
  })

  it('casts Rend only in Battle Stance, never in the execute phase, and every one is a dance from at most 25 rage that keeps min(before, 19)', () => {
    expect(rends.length).toBeGreaterThan(200 * 3)
    for (const r of rends) {
      expect(r.stance).toBe(STANCE.battle)
      expect(r.inPhase).toBe(false)
    }
    expect(dances.length).toBe(rends.length)
    for (const d of dances) {
      expect(d.before).toBeLessThanOrEqual(250)
      expect(d.after).toBe(Math.min(d.before, keep))
    }
    expect(dances.some((d) => d.before > keep)).toBe(true)
  })

  it('goes back to Berserker Stance 1 s later, and Bloodthirst and Whirlwind never come ready while it’s away', () => {
    for (const d of dances) {
      if (d.backAt === null) continue // the fight ended first
      expect(d.backTo).toBe(STANCE.berserker)
      expect(d.backAt - d.t).toBe(plan.stanceSwap.cooldownMs)
      for (const ready of d.readyAt) expect(ready <= d.t || ready >= d.backAt, `ready at ${ready}, away ${d.t}–${d.backAt}`).toBe(true)
    }
    expect(dances.filter((d) => d.backAt !== null).length).toBeGreaterThan(dances.length * 0.95)
  })

  it('never Rends with less than one tick of the fight left, without an execute phase too (W4L-2)', () => {
    for (const r of rends) expect(r.left).toBeGreaterThanOrEqual(TICK_MS)
    const noPhase = run('warrior-fury', { fight: { executePct: 0 }, fights: 300, seed: 991 })
    expect(noPhase.rends.length).toBeGreaterThan(300 * 4)
    for (const r of noPhase.rends) expect(r.left).toBeGreaterThanOrEqual(TICK_MS)
  })

  it('is deterministic: the same seed gives the same Rends', () => {
    const a = run('warrior-fury', { fights: 20, seed: 7 }).rends
    expect(run('warrior-fury', { fights: 20, seed: 7 }).rends).toEqual(a)
  })
})

describe('no Rend that can’t tick (W4L-2; warrior.md §5.2 row 10b, §5.3 row 2)', () => {
  it.each(['warrior-fury', 'warrior-arms'] as const)('%s: none in a fight shorter than a tick, and Rends in a 20 s one', (spec) => {
    const fight = { durationVariationPct: 0, executePct: 0 }
    expect(run(spec, { fight: { ...fight, durationSec: (TICK_MS - 500) / 1000 }, fights: 20 }).rends).toEqual([])
    expect(run(spec, { fight: { ...fight, durationSec: 20 }, fights: 20 }).rends.length).toBeGreaterThan(0)
  })

  it('Arms never Rends with less than one tick of the fight left in its default fight', () => {
    const { rends } = run('warrior-arms', { fights: 300 })
    expect(rends.length).toBeGreaterThan(300 * 5)
    for (const r of rends) expect(r.left).toBeGreaterThanOrEqual(TICK_MS)
  })
})
